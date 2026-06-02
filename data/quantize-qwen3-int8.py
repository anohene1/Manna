#!/usr/bin/env python3
"""Quantize Qwen3-Embedding-0.6B feature-extraction ONNX to usable INT8.

The known-good feature-extraction export can contain FLOAT16 weights and Cast
nodes. ONNX Runtime dynamic quantization may otherwise produce a graph that has
the right embedding inputs but fails Rust ORT load with FLOAT16 quantization
type errors. This script first converts the graph to FLOAT, then quantizes.
"""

from __future__ import annotations

import argparse
import shutil
import tempfile
from pathlib import Path

import onnx
from onnx import TensorProto, numpy_helper
from onnxruntime.quantization import QuantType, quantize_dynamic


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "models" / "qwen3-embedding-0.6b" / "model.onnx"
DEFAULT_DST = ROOT / "models" / "qwen3-embedding-0.6b-int8" / "model_quantized.onnx"
DEFAULT_MIRROR = ROOT / "models" / "qwen3-embedding-0.6b" / "onnx" / "model_quantized.onnx"


def _convert_type(value_type: onnx.TypeProto) -> int:
    if (
        value_type.HasField("tensor_type")
        and value_type.tensor_type.elem_type == TensorProto.FLOAT16
    ):
        value_type.tensor_type.elem_type = TensorProto.FLOAT
        return 1
    return 0


def _convert_tensor(tensor: onnx.TensorProto) -> int:
    if tensor.data_type != TensorProto.FLOAT16:
        return 0

    array = numpy_helper.to_array(tensor).astype("float32")
    tensor.CopyFrom(numpy_helper.from_array(array, name=tensor.name))
    return 1


def convert_float16_graph_to_float(source: Path, output: Path) -> int:
    model = onnx.load(source, load_external_data=False)
    converted = 0

    for value_info in list(model.graph.input) + list(model.graph.output) + list(model.graph.value_info):
        converted += _convert_type(value_info.type)

    for initializer in model.graph.initializer:
        converted += _convert_tensor(initializer)

    for node in model.graph.node:
        for attribute in node.attribute:
            if (
                node.op_type == "Cast"
                and attribute.name == "to"
                and attribute.i == TensorProto.FLOAT16
            ):
                attribute.i = TensorProto.FLOAT
                converted += 1
            if attribute.HasField("t"):
                converted += _convert_tensor(attribute.t)
            for tensor in attribute.tensors:
                converted += _convert_tensor(tensor)

    output.parent.mkdir(parents=True, exist_ok=True)
    onnx.save_model(
        model,
        output,
        save_as_external_data=True,
        all_tensors_to_one_file=True,
        location="model.onnx_data",
        size_threshold=1024,
    )
    return converted


def validate_embedding_signature(model_path: Path) -> None:
    model = onnx.load(model_path, load_external_data=False)
    inputs = [item.name for item in model.graph.input]
    outputs = [item.name for item in model.graph.output]

    bad_input = next((name for name in inputs if name.startswith("past_key_values.")), None)
    if bad_input:
        raise RuntimeError(f"generation/KV-cache input found: {bad_input}")

    bad_output = next((name for name in outputs if name.startswith("present.")), None)
    if bad_output:
        raise RuntimeError(f"generation/KV-cache output found: {bad_output}")

    required_inputs = {"input_ids", "attention_mask"}
    missing = required_inputs.difference(inputs)
    if missing:
        raise RuntimeError(f"missing embedding input(s): {sorted(missing)}")

    embedding_outputs = {"sentence_embedding", "last_hidden_state", "token_embeddings"}
    if not embedding_outputs.intersection(outputs):
        raise RuntimeError(f"missing embedding output; found outputs={outputs}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--output", type=Path, default=DEFAULT_DST)
    parser.add_argument("--mirror", type=Path, default=DEFAULT_MIRROR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.source.exists():
        raise SystemExit(f"missing source ONNX: {args.source}")

    with tempfile.TemporaryDirectory(prefix="manna-qwen3-") as tmp:
        fp32_model = Path(tmp) / "fp32" / "model.onnx"
        converted = convert_float16_graph_to_float(args.source, fp32_model)
        print(f"converted {converted} FLOAT16 graph entries to FLOAT")

        args.output.parent.mkdir(parents=True, exist_ok=True)
        quantize_dynamic(
            str(fp32_model),
            str(args.output),
            weight_type=QuantType.QInt8,
            per_channel=False,
        )

    validate_embedding_signature(args.output)

    if args.mirror:
        args.mirror.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.output, args.mirror)

    size_mb = args.output.stat().st_size / (1024 * 1024)
    print(f"wrote {args.output} ({size_mb:.0f} MB)")
    if args.mirror:
        print(f"mirrored {args.mirror}")


if __name__ == "__main__":
    main()
