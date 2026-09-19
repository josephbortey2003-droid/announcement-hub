import type { AnchorHTMLAttributes, ReactNode } from "react";

type StaticLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
};

export default function StaticLink({ href, children, ...props }: StaticLinkProps) {
  const base = import.meta.env.BASE_URL;
  const target = href.startsWith("/")
    ? href === "/"
      ? base
      : `${base}${href.slice(1).replace(/\/$/, "")}/`
    : href;
  return <a href={target} {...props}>{children}</a>;
}
