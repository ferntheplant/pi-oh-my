export interface ExtensionUIContext {
  notify(message: string, type?: "info" | "warning" | "error"): void;
}

export interface ExtensionContext {
  ui: ExtensionUIContext;
}

export interface SessionStartEvent {
  type: "session_start";
}

export interface BeforeAgentStartEvent {
  type: "before_agent_start";
  systemPrompt: string;
}

export interface BeforeAgentStartEventResult {
  systemPrompt?: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  toolName: string;
}

export interface ToolCallEventResult {
  block?: boolean;
  reason?: string;
}

export interface ExtensionAPI {
  appendEntry<T = unknown>(customType: string, data?: T): void;
  registerCommand(
    name: string,
    options: {
      description?: string;
      handler: (args: string, ctx: ExtensionContext) => Promise<void>;
    },
  ): void;
  on(
    event: "session_start",
    handler: (event: SessionStartEvent, ctx: ExtensionContext) => void | Promise<void>,
  ): void;
  on(
    event: "before_agent_start",
    handler: (
      event: BeforeAgentStartEvent,
      ctx: ExtensionContext,
    ) => BeforeAgentStartEventResult | void | Promise<BeforeAgentStartEventResult | void>,
  ): void;
  on(
    event: "tool_call",
    handler: (
      event: ToolCallEvent,
      ctx: ExtensionContext,
    ) => ToolCallEventResult | void | Promise<ToolCallEventResult | void>,
  ): void;
}
