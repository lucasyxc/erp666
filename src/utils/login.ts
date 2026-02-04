/**
 * 登录方法 - 请求其他项目（aiforoptometry.com）进行账号验证，仅登录用此地址
 * 先根据账号是否为纯中文选择登录地址，再发起请求
 * 子账号（纯中文）→ /subaccount/login/
 * 机构账号（非纯中文）→ /api/login/verif
 * 请求体为 { username, password }
 * 后续业务请求（品牌、商品等）走本项目后端，见 utils/api.ts
 */

/** 登录专用地址，仅登录时请求该地址做校验 */
const LOGIN_API_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_LOGIN_API_BASE) ||
  'https://aiforoptometry.com';

/** 本项目 ERP 后端地址；部署时 VITE_ERP_API_BASE 设为 "" 表示同源 /api/，用 ?? 保留空字符串 */
const ERP_API_BASE =
  (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_ERP_API_BASE : undefined) ?? 'http://127.0.0.1:8001';

/** 纯中文账号走子账号接口，否则走机构账号接口 */
function isChineseAccount(account: string): boolean {
  return /^[\u4e00-\u9fa5]+$/.test((account || '').trim());
}

/**
 * 外部登录成功后，用 organization_id（及机构名称）向本项目后端换取 ERP 签发的 JWT，
 * 后端会按外网机构在本项目中区分账户，不同账户进销存数据独立（子账号同机构共享）。
 */
async function exchangeForErpToken(
  organizationId: number,
  externalAccess: string,
  organizationName?: string
): Promise<{ access: string; refresh: string }> {
  const res = await fetch(`${ERP_API_BASE}/api/auth/erp-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      organization_id: organizationId,
      organization_name: organizationName || undefined,
      external_access: externalAccess,
    }),
  });
  const text = await res.text();
  const data = text.trim() ? JSON.parse(text) : ({} as Record<string, unknown>);
  if (!res.ok) {
    const msg = (data?.message as string) || text || `换取 ERP 凭证失败 ${res.status}`;
    throw new Error(msg);
  }
  const access = data.access as string;
  const refresh = (data.refresh as string) || '';
  if (!access) throw new Error('换取 ERP 凭证返回数据异常');
  return { access, refresh };
}

export interface LoginOptions {
  onRememberUsername?: (name: string) => void;
}

/**
 * 执行登录，成功时写入 localStorage 并返回 { success: true }，失败抛 Error
 */
export async function login(
  username: string,
  password: string,
  opts: LoginOptions = {}
): Promise<{ success: true }> {
  const name = (username || '').trim();
  if (!name) throw new Error('请输入账号');
  if (!password || password.length < 6) throw new Error('密码至少6位');

  // 先根据账号是否为纯中文选择登录地址（仅登录请求此地址）
  const isChinese = isChineseAccount(name);
  const loginUrl = isChinese
    ? `${LOGIN_API_BASE}/subaccount/login/`
    : `${LOGIN_API_BASE}/api/login/verif`;
  const loginData = {
    username: name,
    password,
  };

  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(loginData),
  });

  const text = await res.text();
  const data = text.trim() ? JSON.parse(text) : ({} as Record<string, unknown>);

  if (!res.ok) {
    const msg =
      res.status === 401
        ? isChinese
          ? '子账号或密码错误'
          : '账号或密码错误'
        : res.status === 404
          ? isChinese
            ? '子账号不存在'
            : '账号不存在'
          : (data?.message as string) ||
            (data?.detail as string) ||
            text ||
            `请求失败 ${res.status}`;
    throw new Error(msg);
  }

  if (isChinese) {
    if ((data as { code?: number }).code !== 200) {
      throw new Error((data?.message as string) || '子账号登录失败');
    }
    const orgId = (data as { organization?: { id: number } }).organization?.id;
    const accessToken = data.access as string;
    const refreshToken = (data.refresh as string) || '';
    const csrfToken = (data.csrfToken as string) || '';
    if (orgId == null || !accessToken) throw new Error('登录返回数据异常');
    localStorage.setItem('organization_id', String(orgId));
    localStorage.setItem(
      'organization_name',
      (data.organization_name as string) || ''
    );
    localStorage.setItem(
      'organization',
      JSON.stringify((data as { organization?: object }).organization || {})
    );
    const orgName = (data.organization_name as string) || '';
    const erp = await exchangeForErpToken(orgId, accessToken, orgName);
    localStorage.setItem('access_token', erp.access);
    localStorage.setItem('refresh_token', erp.refresh);
    localStorage.setItem('csrftoken', csrfToken);
    localStorage.setItem('current_username', name);
  } else {
    // 后端返回 success: true 或 success: "Login successful" 均视为成功
    const ok = (data as { success?: boolean | string }).success;
    if (!ok) {
      throw new Error((data?.message as string) || '登录失败');
    }
    const orgIds = (data as { all_organization_ids?: number[] })
      .all_organization_ids;
    const orgId = orgIds?.[0];
    const accessToken = data.access as string;
    const refreshToken = (data.refresh as string) || '';
    const csrfToken = (data.csrfToken as string) || '';
    if (orgId == null || !accessToken) throw new Error('登录返回数据异常');
    const orgName =
      (data.organization_name as string) ||
      ((data as { organization?: { name?: string } }).organization?.name as string) ||
      '';
    localStorage.setItem('organization_id', String(orgId));
    localStorage.setItem('organization_name', orgName);
    localStorage.setItem(
      'organization',
      JSON.stringify((data as { organization?: object }).organization || {})
    );
    const erp = await exchangeForErpToken(orgId, accessToken, orgName);
    localStorage.setItem('access_token', erp.access);
    localStorage.setItem('refresh_token', erp.refresh);
    localStorage.setItem('csrftoken', csrfToken);
    localStorage.setItem('current_username', name);
  }

  if (opts.onRememberUsername) opts.onRememberUsername(name);
  return { success: true };
}
