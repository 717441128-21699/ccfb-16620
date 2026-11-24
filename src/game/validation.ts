import { INITIAL_RECIPES } from '../data/recipes';
import { computeWort, tinsethIBU, tinsethUtilization } from './formulas';

export interface SelfTestReport {
  ok: boolean;
  summary: string;
  lines: string[];
  maxIbuErrorPct: number;
}

function referenceImperialTinseth(alphaPct: number, grams: number, boilMin: number, liters: number, og: number): number {
  // Independent literal transcription in imperial units.
  const ounces = grams / 28.349523125;
  const gallons = liters / 3.785411784;
  const bigness = 1.65 * Math.pow(0.000125, og - 1);
  const boilFactor = (1 - Math.exp(-0.04 * boilMin)) / 4.15;
  const utilization = bigness * boilFactor;
  return ((alphaPct / 100) * ounces * 7490 * utilization) / gallons;
}

export function runSimulationSelfTest(): SelfTestReport {
  const lines: string[] = [];
  let maxIbuErrorPct = 0;
  let ok = true;

  const recipe = structuredClone(INITIAL_RECIPES[0]);
  recipe.mashTempC = 63;
  const at63 = computeWort(recipe);
  recipe.mashTempC = 70;
  const at70 = computeWort(recipe);

  const fermentDrop = at63.fermentability - at70.fermentability;
  const abvDrop = at63.abv - at70.abv;
  lines.push(`63°C 发酵度 ${(at63.fermentability * 100).toFixed(1)}% / ABV ${at63.abv.toFixed(2)}%`);
  lines.push(`70°C 发酵度 ${(at70.fermentability * 100).toFixed(1)}% / ABV ${at70.abv.toFixed(2)}%`);
  lines.push(`温差走势：发酵度下降 ${(fermentDrop * 100).toFixed(1)}pp，ABV下降 ${abvDrop.toFixed(2)}pp`);
  if (!(at63.fermentability > at70.fermentability + 0.08)) {
    ok = false;
    lines.push('失败：63°C到70°C发酵度下降幅度不符合教材经验区间');
  }
  if (!(at63.abv > at70.abv + 0.25)) {
    ok = false;
    lines.push('失败：高温糖化的ABV应明显更低');
  }

  const cases: Array<[number, number, number, number, number]> = [
    [6.8, 140, 60, 200, 1.052],
    [12.4, 80, 5, 200, 1.061],
    [3.6, 520, 70, 200, 1.048],
    [13.5, 340, 75, 200, 1.066],
    [4.8, 250, 25, 200, 1.055],
  ];
  cases.forEach((c, i) => {
    const actual = tinsethIBU(c[0], c[1], c[2], c[3], c[4]);
    const expected = referenceImperialTinseth(...c);
    const error = (Math.abs(actual - expected) / Math.max(0.001, expected)) * 100;
    maxIbuErrorPct = Math.max(maxIbuErrorPct, error);
    lines.push(`Tinseth案例${i + 1}: ${actual.toFixed(3)} vs 独立英制 ${expected.toFixed(3)}，误差 ${error.toFixed(3)}%`);
  });
  lines.push(`标准利用率 U(1.050,60min)=${(tinsethUtilization(1.05, 60) * 100).toFixed(2)}%`);
  if (maxIbuErrorPct > 5) {
    ok = false;
    lines.push('失败：Tinseth实现相对误差超过5%');
  }

  return {
    ok,
    maxIbuErrorPct,
    lines,
    summary: ok
      ? `自检通过：糖化走势正确，Tinseth最大误差 ${maxIbuErrorPct.toFixed(3)}%（≤5%）`
      : '自检发现公式偏差，请查看控制台',
  };
}
