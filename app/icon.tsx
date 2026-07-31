import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <svg viewBox="0 0 130 130" width="32" height="32">
        {/* 蛋形路径,x 方向 +15 平移,在正方形 viewBox 中居中 */}
        <path
          d="M65 2 C89 2 111 46 111 82 C111 111 90 128 65 128 C40 128 19 111 19 82 C19 46 41 2 65 2 Z"
          fill="#e38b4e"
        />
      </svg>
    ),
    size,
  );
}
