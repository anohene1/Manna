/**
 * Downloads the Qwen3-Embedding-0.6B ONNX model exported for feature-extraction.
 *
 * IMPORTANT: The onnx-community export has KV cache inputs (text-generation format).
 * We need to export it ourselves using optimum-cli with --task feature-extraction.
 *
 * This script automatically:
 *   1. Verifies Python >= 3.9.0 is available
 *   2. Creates a .venv if one doesn't exist
 *   3. Installs ONNX export + quantization tooling into the venv
 *   4. Runs optimum-cli to export the feature-extraction model
 *   5. Converts the FP16 graph to FP32 and quantizes it to INT8
 *
 * Run: bun run download:model
 *      bun run download:model --quantize-only
 */

import { join } from "node:path"
import {
  ensurePythonEnv,
  getVenvBin,
  PROJECT_ROOT,
} from "./lib/python-env"

const MODELS_DIR = join(PROJECT_ROOT, "models", "qwen3-embedding-0.6b")
const MODELS_DIR_INT8 = join(
  PROJECT_ROOT,
  "models",
  "qwen3-embedding-0.6b-int8"
)

async function main() {
  const quantizeOnly = process.argv.includes("--quantize-only")

  // --- Phase 1: Python environment setup ---
  await ensurePythonEnv([
    "optimum-onnx[onnxruntime]",
    "onnx",
    "onnxruntime",
    "sentence-transformers==5.4.1",
    "accelerate",
  ])

  // --- Phase 2: Export model ---
  const optimumCli = getVenvBin("optimum-cli")
  const python = getVenvBin(process.platform === "win32" ? "python" : "python3")

  if (!quantizeOnly) {
    console.log(
      "\n🧠 Exporting Qwen3-Embedding-0.6B to ONNX (feature-extraction)...\n"
    )
    console.log(
      "  This downloads the model from HuggingFace and converts it to ONNX format."
    )
    console.log(
      "  The export uses --task feature-extraction to avoid KV cache inputs."
    )
    console.log("  This may take a few minutes on first run.\n")

    const proc = Bun.spawn(
      [
        optimumCli,
        "export",
        "onnx",
        "--model",
        "Qwen/Qwen3-Embedding-0.6B",
        "--task",
        "feature-extraction",
        MODELS_DIR,
      ],
      {
        stdout: "inherit",
        stderr: "inherit",
      }
    )

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      console.error("\n❌ Export failed.")
      process.exit(1)
    }

    console.log(`\n✅ Model exported to ${MODELS_DIR}\n`)
  } else {
    console.log("\n⏭ Skipping export; quantizing existing ONNX model.\n")
  }

  // --- Phase 3: Quantize to INT8 ---
  console.log("\n⚡ Quantizing model to INT8...\n")
  console.log("  The quantizer first converts FP16 graph entries to FP32.")
  console.log("  This avoids ONNX Runtime FLOAT16 quantization load errors.\n")

  const quantizeProc = Bun.spawn(
    [
      python,
      join(PROJECT_ROOT, "data", "quantize-qwen3-int8.py"),
      "--source",
      join(MODELS_DIR, "model.onnx"),
      "--output",
      join(MODELS_DIR_INT8, "model_quantized.onnx"),
      "--mirror",
      join(MODELS_DIR, "onnx", "model_quantized.onnx"),
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
    }
  )

  const quantizeExitCode = await quantizeProc.exited
  if (quantizeExitCode !== 0) {
    console.error("\n⚠️  Quantization failed. The FP32 model is still usable.")
    console.error("   To retry quantization: bun run quantize:model")
  } else {
    console.log(`\n✅ INT8 model quantized to ${MODELS_DIR_INT8}\n`)
  }

  console.log("  Files created:")
  console.log("  - model.onnx (FP32, feature-extraction, no KV cache)")
  console.log("  - model_quantized.onnx (INT8, ARM64-optimized)")
  console.log("  - tokenizer.json")
}

main().catch((err) => {
  console.error("❌ Failed:", err)
  process.exit(1)
})
