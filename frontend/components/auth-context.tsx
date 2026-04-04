"use client";

import { createContext, useContext } from "react";

const AuthTokenContext = createContext<string | null>(null);

export const AuthTokenProvider = AuthTokenContext.Provider;

export function useAuthToken(): string | null {
  return useContext(AuthTokenContext);
}
