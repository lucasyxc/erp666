/** 光度范围工具：与商品编辑页 PowerRangeTable 使用的球镜/柱镜数组一致 */

/** 柱镜值数组（0 ~ -6.00，步长 0.25） */
export function getCylinderValues(): number[] {
  const values: number[] = [];
  for (let i = 0; i >= -6.0; i -= 0.25) {
    values.push(Math.round(i * 100) / 100);
  }
  return values;
}

/** 球镜值数组（-20.00 ~ +20.00，步长 0.25），索引即行号 */
export function getSphereValues(): number[] {
  const values: number[] = [];
  for (let i = -20.0; i <= 20.0; i += 0.25) {
    values.push(Math.round(i * 100) / 100);
  }
  return values;
}

/** 将 powerRange 的 cellKey（格式 "rowIndex_cylinderValue"）转为光度描述，如 "-3.00/-0.50" */
export function cellKeyToDegree(cellKey: string): string {
  const [ri, cv] = cellKey.split('_');
  const rowIndex = parseInt(ri || '0', 10);
  const cyl = parseFloat(cv || '0');
  const spheres = getSphereValues();
  const sphere = spheres[rowIndex] ?? 0;
  const s = sphere >= 0 ? `+${sphere.toFixed(2)}` : sphere.toFixed(2);
  const c = cyl >= 0 ? `+${cyl.toFixed(2)}` : cyl.toFixed(2);
  return `${s}/${c}`;
}

/** 将 powerRange 字符串数组转为 { degree }[]，用于镜片采购弹窗每行度数 */
export function powerRangeToDegreeRows(cells: string[]): { degree: string }[] {
  return (cells || []).map((cellKey) => ({ degree: cellKeyToDegree(cellKey) }));
}

/** 光度字符串转 cellKey（如 "-3.00/-0.50" → "rowIndex_cylValue"），用于镜片采购编辑时还原 */
export function degreeToCellKey(degree: string): string | null {
  const parts = degree.split('/');
  if (parts.length !== 2) return null;
  const s = parseFloat(parts[0].trim());
  const c = parseFloat(parts[1].trim());
  if (Number.isNaN(s) || Number.isNaN(c)) return null;
  const spheres = getSphereValues();
  const cylinders = getCylinderValues();
  const ri = spheres.findIndex((v) => Math.abs(v - s) < 0.01);
  const ci = cylinders.findIndex((v) => Math.abs(v - c) < 0.01);
  if (ri === -1 || ci === -1) return null;
  return `${ri}_${cylinders[ci]}`;
}
