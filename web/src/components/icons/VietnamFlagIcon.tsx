import { SVGProps } from "react";

export function VietnamFlagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="12"
      viewBox="0 0 30 20"
      className="rounded-sm flex-shrink-0"
      {...props}
    >
      <rect width="30" height="20" fill="#DA251D" />
      <polygon
        points="15,4 16.2,8.5 20.8,8.5 17.1,11.3 18.5,15.8 15,13 11.5,15.8 12.9,11.3 9.2,8.5 13.8,8.5"
        fill="#FFFF00"
      />
    </svg>
  );
}
