export type ZellijSessionStatus = "alive" | "exited";

export interface ZellijSession {
  name: string;
  status: ZellijSessionStatus;
}

export interface SpawnPaneOptions {
  /** Display name for the pane (appears in Zellij frame) */
  paneName?: string;
  /** Direction for pane placement: "right" | "down". Omit for automatic. */
  direction?: "right" | "down";
  /** Whether to close the pane when the command exits */
  closeOnExit?: boolean;
  /** Working directory for the command */
  cwd?: string;
}
