"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noopSubscribe = () => () => {};

/** Props of {@link EditorPortal}. */
export interface EditorPortalProps {
  children?: ReactNode;
}

/**
 * Renders children into `document.body` (client only, hydration safe). Escapes ancestor
 * `touch-action: none` / `overflow: hidden` / stacking contexts of the editor root. React hides
 * portal content together with its owner when the route is hidden by `<Activity>`.
 */
export function EditorPortal({ children }: EditorPortalProps) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  if (!isClient) return null;
  return createPortal(children, document.body);
}
