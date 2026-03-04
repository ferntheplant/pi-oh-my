export interface ZellijExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function readStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let output = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        output += decoder.decode(value, { stream: true });
      }
    }
  } catch {
    // Reader cancellation is expected for long-lived detached descendants.
  }

  output += decoder.decode();
  return output;
}

export async function zellijExec(args: string[]): Promise<ZellijExecResult> {
  console.debug("[zellij]", "zellij", ...args);

  const proc = Bun.spawn(["zellij", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutReader = proc.stdout.getReader();
  const stderrReader = proc.stderr.getReader();

  const stdoutPromise = readStream(stdoutReader);
  const stderrPromise = readStream(stderrReader);

  const exitCode = await proc.exited;

  await Promise.allSettled([stdoutReader.cancel(), stderrReader.cancel()]);
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  return {
    stdout,
    stderr,
    exitCode,
  };
}
