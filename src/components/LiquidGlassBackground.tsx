"use client";

import { useEffect, useRef } from "react";

/**
 * iOS 26 Liquid Glass 風の背景
 * Canvas で有機的なグラデーションブロブをアニメーション
 * + SVGフィルター定義（ガラス屈折エフェクト用）
 */
export function LiquidGlassBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // リサイズハンドリング
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;

    // 有機的に動くブロブの定義
    const blobs = [
      { x: 0.2, y: 0.15, r: 0.45, color: [30, 100, 200], speed: 0.0004, phase: 0 },
      { x: 0.75, y: 0.2, r: 0.38, color: [20, 170, 180], speed: 0.0005, phase: 1.5 },
      { x: 0.5, y: 0.7, r: 0.42, color: [50, 180, 140], speed: 0.0003, phase: 3 },
      { x: 0.1, y: 0.8, r: 0.32, color: [80, 140, 220], speed: 0.00045, phase: 4.5 },
      { x: 0.85, y: 0.65, r: 0.35, color: [40, 200, 170], speed: 0.00035, phase: 2 },
      { x: 0.4, y: 0.3, r: 0.28, color: [130, 200, 240], speed: 0.0006, phase: 5 },
    ];

    let t = 0;
    const draw = () => {
      const cw = w();
      const ch = h();
      ctx.setTransform(Math.min(window.devicePixelRatio, 2), 0, 0, Math.min(window.devicePixelRatio, 2), 0, 0);

      // ベースグラデーション（iOS 26風：上が深いブルー、下がティール〜グリーン）
      const baseGrad = ctx.createLinearGradient(0, 0, cw * 0.3, ch);
      baseGrad.addColorStop(0, "#0c3d7a");
      baseGrad.addColorStop(0.3, "#1565a8");
      baseGrad.addColorStop(0.55, "#0e8e93");
      baseGrad.addColorStop(0.75, "#1a9e8f");
      baseGrad.addColorStop(1, "#3ab09a");
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, cw, ch);

      // 有機的なブロブを描画
      for (const blob of blobs) {
        const bx = blob.x * cw + Math.sin(t * blob.speed * 2 + blob.phase) * cw * 0.06;
        const by = blob.y * ch + Math.cos(t * blob.speed * 1.5 + blob.phase) * ch * 0.05;
        const br = blob.r * Math.min(cw, ch) * (0.9 + 0.1 * Math.sin(t * blob.speed + blob.phase));
        const [cr, cg, cb] = blob.color;

        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.45)`);
        grad.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.15)`);
        grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }

      // 明るいハイライト層（光の差し込み）
      const lightGrad = ctx.createRadialGradient(cw * 0.65, ch * 0.1, 0, cw * 0.65, ch * 0.1, cw * 0.5);
      lightGrad.addColorStop(0, "rgba(180, 220, 255, 0.2)");
      lightGrad.addColorStop(0.5, "rgba(180, 220, 255, 0.05)");
      lightGrad.addColorStop(1, "rgba(180, 220, 255, 0)");
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, cw, ch);

      t += 16;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <>
      {/* SVGフィルター: ガラスの屈折・歪みエフェクト */}
      <svg className="absolute" width="0" height="0" aria-hidden="true">
        <defs>
          {/* 液体ガラスの屈折フィルター */}
          <filter id="liquid-glass-refraction" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015"
              numOctaves="3"
              seed="5"
              result="turbulence"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="turbulence"
              scale="3"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation="0.3" result="softened" />
            <feComposite in="softened" in2="SourceGraphic" operator="in" />
          </filter>

          {/* 水泡/水滴のハイライト効果 */}
          <filter id="liquid-droplet" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
            <feSpecularLighting
              in="blur"
              surfaceScale="8"
              specularConstant="0.8"
              specularExponent="25"
              lightingColor="#ffffff"
              result="specular"
            >
              <fePointLight x="100" y="-50" z="200" />
            </feSpecularLighting>
            <feComposite in="specular" in2="SourceAlpha" operator="in" result="specularMask" />
            <feComposite in="SourceGraphic" in2="specularMask" operator="arithmetic"
              k1="0" k2="1" k3="0.6" k4="0" />
          </filter>
        </defs>
      </svg>

      {/* Canvas背景 */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 -z-10"
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
      />
    </>
  );
}
