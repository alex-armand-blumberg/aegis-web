import Image from "next/image";
import Link from "next/link";

const LOGO_SRC = "/aegis-hq-logo.png";

type Props = {
  className?: string;
  href?: string;
  size?: "nav" | "footer" | "display";
  priority?: boolean;
};

const SIZE = {
  nav: { width: 60, height: 60 },
  footer: { width: 66, height: 66 },
  display: { width: 108, height: 108 },
} as const;

export function AegisLogo({ className = "", href = "/", size = "nav", priority = false }: Props) {
  const dims = SIZE[size];
  const image = (
    <Image
      src={LOGO_SRC}
      alt="AEGIS HQ"
      width={dims.width}
      height={dims.height}
      className={`aegis-logo-img aegis-logo-img-${size}`.trim()}
      priority={priority}
    />
  );

  if (!href) {
    return <span className={`aegis-logo ${className}`.trim()}>{image}</span>;
  }

  return (
    <Link href={href} className={`aegis-logo ${className}`.trim()}>
      {image}
    </Link>
  );
}
