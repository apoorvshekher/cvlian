/* Typed ESM port of SwiftLaTeX's PdfTeXEngine.js (release v20022022),
 * carrying our local patches:
 *   - setTexliveEndpoint no longer kills the worker (upstream bug)
 *   - compileFormat() resolves with the format bytes
 * The worker itself (public/swiftlatexpdftex.js) is also patched to fall
 * back to the requested filename when the `fileid`/`pkid` response header
 * is absent, since static hosts (GitHub Pages) can't send custom headers;
 * to remember a 404 as "not there" (upstream only remembered its own
 * server's 301, so every pass of every compile asked again); and to take
 * a `preloadtexlive` command — files fetched ahead of a compile, in
 * parallel (see src/prefetch.ts). Grep it for "cvlian patched".
 */

export interface CompileResult {
  pdf?: Uint8Array;
  status: number;
  log: string;
}

enum EngineStatus {
  Init = 1,
  Ready,
  Busy,
  Error,
}

interface WorkerMsg {
  result?: string;
  cmd?: string;
  log?: string;
  status?: number;
  pdf?: ArrayBuffer;
}

export class PdfTeXEngine {
  private worker: Worker | undefined;
  private status = EngineStatus.Init;

  constructor(private enginePath = "swiftlatexpdftex.js") {}

  async loadEngine(): Promise<void> {
    if (this.worker !== undefined) {
      throw new Error("Other instance is running, abort()");
    }
    this.status = EngineStatus.Init;
    await new Promise<void>((resolve, reject) => {
      this.worker = new Worker(this.enginePath);
      this.worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
        if (ev.data.result === "ok") {
          this.status = EngineStatus.Ready;
          resolve();
        } else {
          this.status = EngineStatus.Error;
          reject(new Error("engine worker failed to initialize"));
        }
      };
    });
    this.worker!.onmessage = () => {};
    this.worker!.onerror = () => {};
  }

  isReady(): boolean {
    return this.status === EngineStatus.Ready;
  }

  private checkReady(): void {
    if (!this.isReady()) {
      throw new Error("Engine is still spinning or not ready yet!");
    }
  }

  async compileLaTeX(): Promise<CompileResult> {
    this.checkReady();
    this.status = EngineStatus.Busy;
    const result = await new Promise<CompileResult>((resolve) => {
      this.worker!.onmessage = (ev: MessageEvent<WorkerMsg>) => {
        const data = ev.data;
        if (data.cmd !== "compile") return;
        this.status = EngineStatus.Ready;
        resolve({
          status: data.status ?? -254,
          log: data.log ?? "No log",
          pdf: data.result === "ok" && data.pdf ? new Uint8Array(data.pdf) : undefined,
        });
      };
      this.worker!.postMessage({ cmd: "compilelatex" });
    });
    this.worker!.onmessage = () => {};
    return result;
  }

  /* Builds the TeX format; resolves with the .fmt bytes. */
  async compileFormat(): Promise<Uint8Array> {
    this.checkReady();
    this.status = EngineStatus.Busy;
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      this.worker!.onmessage = (ev: MessageEvent<WorkerMsg>) => {
        const data = ev.data;
        if (data.cmd !== "compile") return;
        this.status = EngineStatus.Ready;
        if (data.result === "ok" && data.pdf) {
          resolve(new Uint8Array(data.pdf));
        } else {
          reject(new Error(data.log || "format build failed"));
        }
      };
      this.worker!.postMessage({ cmd: "compileformat" });
    });
    this.worker!.onmessage = () => {};
    return bytes;
  }

  setEngineMainFile(filename: string): void {
    this.checkReady();
    this.worker?.postMessage({ cmd: "setmainfile", url: filename });
  }

  writeMemFSFile(filename: string, srccode: string | Uint8Array): void {
    this.checkReady();
    this.worker?.postMessage({ cmd: "writefile", url: filename, src: srccode });
  }

  /* Hands over TeX files fetched ahead of a compile, keyed `<format>/<name>`
   * exactly as the worker asks for them, plus names the site does not ship.
   * The buffers are transferred, so they are unusable here afterwards. The
   * worker handles messages in order, so a compile posted after this sees
   * every file. */
  preloadTexFiles(files: { key: string; data: ArrayBuffer }[], missing: string[]): void {
    this.checkReady();
    this.worker?.postMessage(
      { cmd: "preloadtexlive", files, missing },
      files.map((f) => f.data),
    );
  }

  makeMemFSFolder(folder: string): void {
    this.checkReady();
    if (folder === "" || folder === "/") return;
    this.worker?.postMessage({ cmd: "mkdir", url: folder });
  }

  flushCache(): void {
    this.checkReady();
    this.worker?.postMessage({ cmd: "flushcache" });
  }

  setTexliveEndpoint(url: string): void {
    this.worker?.postMessage({ cmd: "settexliveurl", url });
  }

  closeWorker(): void {
    if (this.worker !== undefined) {
      this.worker.postMessage({ cmd: "grace" });
      this.worker = undefined;
    }
  }
}
