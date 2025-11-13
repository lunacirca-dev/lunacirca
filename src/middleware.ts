import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, locales } from "./i18n/locales";
import { isLanguageCode, tryNormalizeLanguageCode } from "./lib/language";

type LocaleValue = (typeof locales)[number];

const DEFAULT_HOSTS = new Set([
  "localhost",
  "localhost:3000",
  "localhost:8787",
  "127.0.0.1",
  "127.0.0.1:3000",
  "127.0.0.1:8787",
  "127.0.0.1:8788",
]);

const envHost = (process.env.NEXT_PUBLIC_APP_DOMAIN ?? "").trim().toLowerCase();
if (envHost) DEFAULT_HOSTS.add(envHost);
const envHosts = (process.env.NEXT_PUBLIC_APP_HOSTS ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
for (const host of envHosts) {
  DEFAULT_HOSTS.add(host);
}

type DomainCacheEntry = {
  code: string | null;
  expires: number;
};

const CUSTOM_DOMAIN_CACHE = new Map<string, DomainCacheEntry>();
const CACHE_TTL = 60 * 1000;
const NEGATIVE_TTL = 30 * 1000;

function detect(req: NextRequest): LocaleValue {
  const cookieLang = req.cookies.get("lang")?.value;
  const normalizedCookie = cookieLang ? tryNormalizeLanguageCode(cookieLang) : null;
  if (normalizedCookie && isLanguageCode(normalizedCookie)) return normalizedCookie as LocaleValue;

  const accept = req.headers.get("accept-language") ?? "";
  const found = accept.split(",").map((s) => s.split(";")[0].trim());
  for (const candidate of found) {
    const normalized = tryNormalizeLanguageCode(candidate);
    if (normalized && isLanguageCode(normalized)) return normalized as LocaleValue;
  }
  return defaultLocale;
}

const shouldBypass = (pathname: string) =>
  pathname.startsWith("/_next") ||
  pathname.startsWith("/api") ||
  pathname.startsWith("/dl") ||
  pathname.startsWith("/m") ||
  pathname === "/d" ||
  pathname.startsWith("/d/") ||
  pathname === "/favicon.ico";

async function lookupCustomDomain(req: NextRequest, host: string) {
  if (!host || DEFAULT_HOSTS.has(host)) return null;
  const cached = CUSTOM_DOMAIN_CACHE.get(host);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return cached.code;
  }

  const lookupUrl = new URL("/api/custom-domains/resolve", req.nextUrl);
  lookupUrl.searchParams.set("hostname", host);
  try {
    const response = await fetch(lookupUrl, {
      headers: { "x-custom-domain-resolve": "1" },
      cache: "no-store",
    });
    if (!response.ok) {
      CUSTOM_DOMAIN_CACHE.set(host, { code: null, expires: now + NEGATIVE_TTL });
      return null;
    }
    const data = (await response.json()) as { ok?: boolean; linkCode?: string };
    const code = data?.ok && data.linkCode ? data.linkCode : null;
    CUSTOM_DOMAIN_CACHE.set(host, {
      code,
      expires: now + (code ? CACHE_TTL : NEGATIVE_TTL),
    });
    return code;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (req.headers.get("x-custom-domain-resolve") === "1") {
    return NextResponse.next();
  }

  const isResolvePath = pathname.startsWith("/api/custom-domains/resolve");
  const bypassed = shouldBypass(pathname);

  if (!isResolvePath && !bypassed) {
    const host = (req.headers.get("host") ?? "").toLowerCase();
    const linkCode = await lookupCustomDomain(req, host);
    if (linkCode) {
      if (pathname === "/" || pathname === "") {
        const rewriteUrl = req.nextUrl.clone();
        rewriteUrl.pathname = `/d/${linkCode}`;
        return NextResponse.rewrite(rewriteUrl);
      }
      return NextResponse.next();
    }
  }

  if (req.method === "POST") {
    const segments = pathname.split("/").filter(Boolean);
    const isBaseComplete = segments.length === 2 && segments[0] === "recharge" && segments[1] === "complete";
    const isLocaleComplete =
      segments.length === 3 &&
      segments[1] === "recharge" &&
      segments[2] === "complete" &&
      (locales as readonly string[]).includes(segments[0] ?? "");

    if (isBaseComplete || isLocaleComplete) {
      const url = req.nextUrl.clone();
      return NextResponse.redirect(url, 303);
    }
  }

  if (bypassed) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];
  const isKnownLocale = (locales as readonly string[]).includes(maybeLocale ?? "");

  if (!isKnownLocale) {
    const lang = detect(req);
    const url = req.nextUrl.clone();
    url.pathname = `/${lang}${pathname}`;
    const res = NextResponse.redirect(url);
    res.cookies.set("lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    res.cookies.set("locale", lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return res;
  }

  const response = NextResponse.next();
  const cookieLang = req.cookies.get("lang")?.value;
  if (!cookieLang || cookieLang !== maybeLocale) {
    response.cookies.set("lang", maybeLocale as LocaleValue, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  const cookieLocale = req.cookies.get("locale")?.value;
  if (!cookieLocale || cookieLocale !== maybeLocale) {
    response.cookies.set("locale", maybeLocale as LocaleValue, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"]
};
