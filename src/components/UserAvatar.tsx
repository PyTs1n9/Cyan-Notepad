import { useEffect, useState, type CSSProperties } from "react";

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  style?: CSSProperties;
}

export default function UserAvatar({
  name,
  avatarUrl,
  className = "",
  style,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [avatarUrl]);

  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() || "?";

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={style}
      aria-hidden="true"
    >
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
