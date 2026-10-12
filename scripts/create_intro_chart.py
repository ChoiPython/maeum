from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib import font_manager


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)

font_path = Path(r"C:\Windows\Fonts\malgun.ttf")
font = font_manager.FontProperties(fname=str(font_path))
plt.rcParams["font.family"] = font.get_name()
plt.rcParams["axes.unicode_minus"] = False

groups = ["전체 청년", "대학 재학·휴학"]
burnout_2022 = [33.9, 30.5]
burnout_2024 = [32.2, 29.7]
depression_2022 = [6.1, 4.7]
depression_2024 = [8.8, 6.4]

fig, axes = plt.subplots(1, 2, figsize=(12, 6.2), dpi=180)
fig.patch.set_facecolor("white")

palette = {"2022": "#B8C1C8", "2024": "#388E7C"}


def grouped_bars(ax, old_values, new_values, title, ymax):
    x = range(len(groups))
    width = 0.32
    bars_old = ax.bar(
        [i - width / 2 for i in x],
        old_values,
        width,
        color=palette["2022"],
        label="2022년",
    )
    bars_new = ax.bar(
        [i + width / 2 for i in x],
        new_values,
        width,
        color=palette["2024"],
        label="2024년",
    )
    ax.set_title(title, fontsize=15, fontweight="bold", pad=14)
    ax.set_xticks(list(x), groups, fontsize=11)
    ax.set_ylabel("비율(%)", fontsize=11)
    ax.set_ylim(0, ymax)
    ax.grid(axis="y", color="#E4E8EB", linewidth=0.8)
    ax.set_axisbelow(True)
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.spines["bottom"].set_color("#9AA3AA")
    ax.tick_params(axis="y", length=0, colors="#4F5961")
    ax.legend(frameon=False, ncol=2, loc="upper center", bbox_to_anchor=(0.5, 1.0))
    for bars in (bars_old, bars_new):
        for bar in bars:
            value = bar.get_height()
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                value + ymax * 0.025,
                f"{value:.1f}",
                ha="center",
                va="bottom",
                fontsize=11,
                fontweight="bold",
                color="#263238",
            )


grouped_bars(axes[0], burnout_2022, burnout_2024, "최근 1년 이내 소진 경험률", 42)
grouped_bars(axes[1], depression_2022, depression_2024, "우울증상 경험률", 12)

fig.suptitle(
    "청년 및 대학 재학·휴학자의 정신건강 관련 지표",
    fontsize=19,
    fontweight="bold",
    y=0.98,
)
fig.text(
    0.01,
    0.025,
    "주: 우울증상 경험률은 PHQ-9 총점 27점 중 10점 이상인 경우임.",
    fontsize=9,
    color="#4F5961",
)
fig.text(
    0.01,
    0.002,
    "출처: 김동진 외(2025), 『청년 건강 실태와 정책과제』, 한국보건사회연구원, pp. 125-126; 2024년 청년 삶 실태조사 재인용.",
    fontsize=8.5,
    color="#4F5961",
)
fig.tight_layout(rect=(0, 0.08, 1, 0.9), w_pad=3.2)

png_path = OUT / "대학생_청년_정신건강_통계.png"
svg_path = OUT / "대학생_청년_정신건강_통계.svg"
fig.savefig(png_path, bbox_inches="tight", facecolor="white")
fig.savefig(svg_path, bbox_inches="tight", facecolor="white")
print(png_path)
print(svg_path)
