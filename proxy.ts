import { NextRequest, NextResponse } from "next/server";

const BASIC_AUTH_USERNAME = process.env.APP_BASIC_AUTH_USERNAME;
const BASIC_AUTH_PASSWORD = process.env.APP_BASIC_AUTH_PASSWORD;

export function proxy(request: NextRequest) {
  if (!BASIC_AUTH_USERNAME || !BASIC_AUTH_PASSWORD) {
    return NextResponse.next();
  }

  if (isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Personal X Dashboard", charset="UTF-8"',
    },
  });
}

function isAuthorized(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = atob(authorizationHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return false;
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    return username === BASIC_AUTH_USERNAME && password === BASIC_AUTH_PASSWORD;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
