

import os
import sys
import random
from typing import Union

import sympy
from sympy import (
    Symbol, Integer, Rational, Float,
    Add, Mul, Pow, Eq,
    sympify, SympifyError,
    Number, S,
)

from google import genai


# Windows コンソールの cp932 で絵文字が出力不可になる問題を回避
# UTF-8 出力を強制する
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8")


# ----------------------------------------------------------
# Step 1: OCR モック関数
# ----------------------------------------------------------
def run_zai_ocr(image_path: str) -> str:
    """
    本番では OCR API を呼び出す想定。
    ここではダミーとして SymPy パース可能な数式文字列を返す。
    """
    # 複数のサンプル数式からランダムに返すことでテストしやすくする
    samples = [
        "2*x**2 + 4*x - 6 = 0",
        "3*x**3 - 9*x + 12 = 0",
        "x**2 - 5*x + 6 = 0",
        "4*x**2 + 8*x - 3 = 0",
    ]
    print(f"[OCR Mock] 画像パス '{image_path}' を受け取りました")
    chosen = random.choice(samples)
    print(f"[OCR Mock] 返却する数式: {chosen}")
    return chosen


# ----------------------------------------------------------
# Step 2: SymPy AST を再帰走査して係数・定数のみ置換
# ----------------------------------------------------------
def replace_coefficients(
    expr: sympy.Basic,
    low: int = 1,
    high: int = 9,
) -> sympy.Basic:
    """
    SymPy の式木を再帰的に探索し、数値ノード（係数・定数）のみを
    ランダムな整数に置き換える。指数（Pow の exp）は不変。

    ルール:
      A) Integer / Rational / Float -> random.randint(low, high) に置換。
         ただし符号を表す -1（S.NegativeOne）は符号として保持する。
      B) Pow(base, exp) -> base のみ再帰、exp は絶対に変えない。
      C) Add / Mul / その他の関数 -> 引数を再帰処理して再構築。
    """

    # --- ルール A: 数値リーフの処理 ---
    if isinstance(expr, Number):
        # -1 は SymPy が符号を表すために使う特殊値なので保持する
        # (例: -3*x は内部的に Mul(Integer(-1), Integer(3), x) となる場合がある)
        if expr == S.NegativeOne:
            return expr
        # 0 も構造維持のため保持（0 を乱数にすると意味が変わる）
        if expr == S.Zero:
            return expr
        # 1 は乗法の単位元として現れるケースがあるため保持
        if expr == S.One:
            return expr
        # 元の符号を維持しつつ絶対値部分をランダムに変更
        sign = 1 if expr > 0 else -1
        return Integer(sign * random.randint(low, high))

    # --- ルール B: 累乗の処理（指数は不変） ---
    if isinstance(expr, Pow):
        new_base = replace_coefficients(expr.args[0], low, high)
        original_exp = expr.args[1]  # 指数は絶対変えない
        return Pow(new_base, original_exp)

    # --- ルール C: Add / Mul / その他の複合ノード ---
    if expr.args:
        new_args = tuple(
            replace_coefficients(arg, low, high) for arg in expr.args
        )
        return expr.func(*new_args)

    # --- Symbol 等のアトミックノードはそのまま返す ---
    return expr


def parse_and_transform(ocr_text: str) -> str:
    """
    OCR テキストを SymPy でパースし、係数を置換した新しい数式文字列を返す。
    '=' を含む方程式形式と、単なる式の両方に対応する。
    """
    x = Symbol("x")
    local_dict = {"x": x}

    if "=" in ocr_text:
        # 方程式: "lhs = rhs" -> Eq(lhs, rhs)
        lhs_str, rhs_str = ocr_text.split("=", 1)
        lhs = sympify(lhs_str.strip(), locals=local_dict)
        rhs = sympify(rhs_str.strip(), locals=local_dict)
        equation = Eq(lhs, rhs)

        new_lhs = replace_coefficients(equation.lhs)
        new_rhs = replace_coefficients(equation.rhs)
        new_eq = Eq(new_lhs, new_rhs)
        return str(new_eq)
    else:
        expr = sympify(ocr_text.strip(), locals=local_dict)
        new_expr = replace_coefficients(expr)
        return str(new_expr)


# ----------------------------------------------------------
# Step 3: Gemini API による解説生成（新 SDK: google-genai）
# ----------------------------------------------------------
def generate_explanation(new_math_expr: str) -> str:
    """
    google.genai (新 SDK) を使い、新しい数式のステップバイステップ解説を生成する。
    """
    api_key = os.environ.get("GOOGLE_GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "環境変数 GOOGLE_GEMINI_API_KEY が設定されていません。\n"
            "  Windows:  set GOOGLE_GEMINI_API_KEY=your-key-here\n"
            "  Linux/Mac: export GOOGLE_GEMINI_API_KEY=your-key-here"
        )

    # 新 SDK の初期化方法
    client = genai.Client(api_key=api_key)

    prompt = (
        "あなたは親しみやすい天才数学教師です。"
        "以下の【新しい数式】を解くためのステップバイステップの解説と"
        "最終的な答えを、箇条書きを活用してわかりやすく出力してください。\n\n"
        f"【新しい数式】: {new_math_expr}"
    )

    # gemini 3系モデルで生成
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt,
    )
    return response.text


# ----------------------------------------------------------
# メインパイプライン
# ----------------------------------------------------------
def main():
    print("=" * 60)
    print("  数式類題生成 & Gemini 解説システム")
    print("=" * 60)

    # --- Step 1: OCR（モック） ---
    image_path = "sample_math.png"  # ダミーパス
    ocr_text = run_zai_ocr(image_path)
    print(f"\n[Step 1] OCR 結果（元の数式）: {ocr_text}")

    # --- Step 2: 係数変換 ---
    try:
        new_expr_str = parse_and_transform(ocr_text)
    except SympifyError as e:
        print(f"\n[Step 2] SymPy パースエラー: {e}")
        print("  OCR テキストが SymPy で解釈可能な形式か確認してください。")
        return
    except Exception as e:
        print(f"\n[Step 2] 係数変換中に予期せぬエラー: {e}")
        return

    print(f"[Step 2] 類題（係数変換後）    : {new_expr_str}")

    # --- Step 3: Gemini 解説生成 ---
    try:
        explanation = generate_explanation(new_expr_str)
    except EnvironmentError as e:
        print(f"\n[Step 3] {e}")
        return
    except Exception as e:
        print(f"\n[Step 3] Gemini API エラー: {e}")
        return

    print("\n" + "=" * 60)
    print("[Step 3] Gemini による解説:")
    print("=" * 60)
    print(explanation)


if __name__ == "__main__":
    main()
