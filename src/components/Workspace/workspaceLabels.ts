import type { LangType } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";
import type {
  WorkspaceDocumentAccessLevel,
  WorkspaceDocumentPublicationStatus,
  WorkspaceRole,
} from "@/types/workspace";

/**
 * Display strings shared by the workspace sidebar, the strip and the manage
 * modal. They were inline closures in `WorkspaceView`; now that three
 * components render the same words, one copy keeps them from drifting apart.
 */

export function roleLabel(lang: LangType, role: WorkspaceRole): string {
  return t(lang, role === "owner" ? "roleOwner" : role === "editor" ? "roleEditor" : "roleViewer");
}

export function accessLevelLabel(lang: LangType, accessLevel: WorkspaceDocumentAccessLevel): string {
  return t(
    lang,
    accessLevel === "creator"
      ? "accessCreator"
      : accessLevel === "managers"
        ? "accessManagers"
        : "accessMembers",
  );
}

export function accessLevelHint(lang: LangType, accessLevel: WorkspaceDocumentAccessLevel): string {
  return t(
    lang,
    accessLevel === "creator"
      ? "accessCreatorHint"
      : accessLevel === "managers"
        ? "accessManagersHint"
        : "accessMembersHint",
  );
}

export function publicationStatusLabel(
  lang: LangType,
  status: WorkspaceDocumentPublicationStatus,
): string {
  return t(
    lang,
    status === "draft"
      ? "cloudDocumentDraft"
      : status === "scheduled"
        ? "cloudDocumentScheduled"
        : "cloudDocumentPublished",
  );
}

export function formatDocumentDate(lang: LangType, value: string | null): string {
  return value ? new Date(value).toLocaleString(lang === "zh" ? "zh-CN" : "en-US") : "—";
}
