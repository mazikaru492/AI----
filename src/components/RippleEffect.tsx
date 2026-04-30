"use client";

import { useEffect } from "react";

/**
 * グローバルRipple（水紋）エフェクト
 * .liquid-button / .liquid-button-primary / .liquid-button-success が押された位置から
 * 水紋アニメーションを発生させる。各ボタンを個別に書き換える必要なし。
 */
export function RippleEffect() {
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const button = target.closest<HTMLElement>(
        ".liquid-button, .liquid-button-primary, .liquid-button-success",
      );
      if (!button) return;
      if (button.hasAttribute("disabled")) return;

      // ボタンを基準座標に
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      // overflow と position を保証
      const cs = window.getComputedStyle(button);
      if (cs.position === "static") {
        button.style.position = "relative";
      }
      if (cs.overflow === "visible") {
        button.style.overflow = "hidden";
      }

      const ripple = document.createElement("span");
      ripple.className = "liquid-ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      button.appendChild(ripple);

      ripple.addEventListener("animationend", () => {
        ripple.remove();
      });
    };

    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  return null;
}
