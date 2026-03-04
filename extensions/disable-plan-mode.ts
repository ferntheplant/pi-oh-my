import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function disablePlanMode(pi: ExtensionAPI): void {
  pi.on("session_start", async () => {
    pi.appendEntry("plan-mode", { enabled: false });
  });

  pi.on("before_agent_start", async (event) => {
    if (event.systemPrompt.includes("plan mode") || event.systemPrompt.includes("Plan Mode")) {
      return {
        systemPrompt: event.systemPrompt.replace(/\[PLAN MODE[^\]]*\][\s\S]*/m, ""),
      };
    }
  });

  pi.registerCommand("plan", {
    description: "Plan mode is disabled in pi-oh-my sessions",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Plan mode is disabled. Workflow is managed by pi-oh-my.", "info");
    },
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName === "exit_plan_mode") {
      return { block: true, reason: "Plan mode is disabled in pi-oh-my sessions." };
    }
  });
}
