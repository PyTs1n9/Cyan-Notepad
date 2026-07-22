begin;

alter table public.documents
  add column if not exists sort_order bigint;

-- Ordering is metadata, not an edit to the document itself. Keep the existing
-- updated_at value when sort_order is the only changed field.
create or replace function public.set_document_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (to_jsonb(new) - 'sort_order' - 'updated_at')
    is not distinct from
    (to_jsonb(old) - 'sort_order' - 'updated_at') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_document_updated_at();

with ranked_documents as (
  select
    id,
    (row_number() over (
      partition by workspace_id
      order by updated_at desc, created_at desc, id
    ) - 1) * 1024 as next_sort_order
  from public.documents
  where sort_order is null
)
update public.documents as document
set sort_order = ranked_documents.next_sort_order
from ranked_documents
where document.id = ranked_documents.id;

alter table public.documents
  alter column sort_order set not null;

create index if not exists documents_workspace_sort_idx
  on public.documents(workspace_id, sort_order, id);

create or replace function public.create_document(
  target_workspace_id uuid,
  document_title text,
  document_content text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_document_id uuid;
  next_sort_order bigint;
begin
  if public.workspace_role(target_workspace_id) not in ('owner', 'editor') then
    raise exception 'Editor access required';
  end if;
  if char_length(trim(document_title)) < 1 or char_length(trim(document_title)) > 200 then
    raise exception 'Document title must be between 1 and 200 characters';
  end if;

  -- Serialize creates and reorders inside one workspace so two concurrent
  -- operations cannot choose the same leading position.
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text, 0));
  select coalesce(min(sort_order), 1024) - 1024
  into next_sort_order
  from public.documents
  where workspace_id = target_workspace_id;

  insert into public.documents (workspace_id, title, content, created_by, sort_order)
  values (
    target_workspace_id,
    trim(document_title),
    coalesce(document_content, ''),
    auth.uid(),
    next_sort_order
  )
  returning id into new_document_id;
  return new_document_id;
end;
$$;

create or replace function public.reorder_workspace_document(
  target_document_id uuid,
  reference_document_id uuid,
  drop_position text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_workspace_id uuid;
  reference_workspace_id uuid;
  target_access_level text;
  reference_access_level text;
  actor_role text;
  ordered_document_ids uuid[];
  remaining_document_ids uuid[];
  final_document_ids uuid[] := array[]::uuid[];
  reference_index integer;
  insertion_index integer;
  remaining_count integer;
begin
  if drop_position not in ('before', 'after') then
    raise exception 'Invalid document drop position';
  end if;
  if target_document_id = reference_document_id then
    return;
  end if;

  select workspace_id, access_level
  into target_workspace_id, target_access_level
  from public.documents
  where id = target_document_id;

  select workspace_id, access_level
  into reference_workspace_id, reference_access_level
  from public.documents
  where id = reference_document_id;

  if target_workspace_id is null or reference_workspace_id is null then
    raise exception 'Document not found';
  end if;
  if target_workspace_id <> reference_workspace_id then
    raise exception 'Documents must belong to the same workspace';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text, 0));

  -- Re-read and lock both rows after taking the workspace lock so their
  -- document access levels cannot change midway through the move.
  select workspace_id, access_level
  into target_workspace_id, target_access_level
  from public.documents
  where id = target_document_id
  for update;

  select workspace_id, access_level
  into reference_workspace_id, reference_access_level
  from public.documents
  where id = reference_document_id
  for update;

  if target_workspace_id is null or reference_workspace_id is null then
    raise exception 'Document not found';
  end if;
  if target_workspace_id <> reference_workspace_id then
    raise exception 'Documents must belong to the same workspace';
  end if;

  actor_role := public.workspace_role(target_workspace_id);
  if actor_role not in ('owner', 'editor')
    or not public.can_access_document(target_workspace_id, target_access_level)
    or not public.can_access_document(reference_workspace_id, reference_access_level) then
    raise exception 'Document reorder access required';
  end if;

  select array_agg(id order by sort_order, created_at desc, id)
  into ordered_document_ids
  from public.documents
  where workspace_id = target_workspace_id;

  remaining_document_ids := array_remove(ordered_document_ids, target_document_id);
  reference_index := array_position(remaining_document_ids, reference_document_id);
  if reference_index is null then
    raise exception 'Reference document not found';
  end if;

  insertion_index := reference_index + case when drop_position = 'after' then 1 else 0 end;
  remaining_count := coalesce(array_length(remaining_document_ids, 1), 0);

  if insertion_index > 1 then
    final_document_ids := final_document_ids || remaining_document_ids[1:(insertion_index - 1)];
  end if;
  final_document_ids := final_document_ids || target_document_id;
  if insertion_index <= remaining_count then
    final_document_ids := final_document_ids || remaining_document_ids[insertion_index:remaining_count];
  end if;

  update public.documents as document
  set sort_order = (positions.ordinal_position - 1) * 1024
  from unnest(final_document_ids) with ordinality as positions(document_id, ordinal_position)
  where document.id = positions.document_id
    and document.sort_order is distinct from (positions.ordinal_position - 1) * 1024;
end;
$$;

revoke execute on function public.set_document_updated_at() from public, anon, authenticated;
revoke execute on function public.reorder_workspace_document(uuid, uuid, text) from public, anon;
grant execute on function public.reorder_workspace_document(uuid, uuid, text) to authenticated;

commit;
