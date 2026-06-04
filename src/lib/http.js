import { NextResponse } from "next/server";
import { isAdminRequest, requireSameOrigin } from "./security.js";

export function jsonError(message, status = 400, headers = undefined) {
  return NextResponse.json({ success: false, error: message }, { status, headers });
}

export function requireAdmin(request, { mutation = false } = {}) {
  if (!isAdminRequest(request)) {
    return jsonError("Admin session required.", 401);
  }
  if (mutation && !requireSameOrigin(request)) {
    return jsonError("Cross-origin request rejected.", 403);
  }
  return null;
}

export function serverError(error, label) {
  console.error(label, error);
  return jsonError("The server could not complete this request.", 500);
}
