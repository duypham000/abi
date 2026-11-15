import { useState } from "react";
import { Button, Slider, Checkbox, Input, Space } from "antd";
import "./PasswordGenerator.scss";

const CHARSET = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

interface Props {
  onUse: (value: string) => void;
}

export default function PasswordGenerator({ onUse }: Props) {
  const [length, setLength] = useState(16);
  const [options, setOptions] = useState({
    upper: true,
    lower: true,
    numbers: true,
    symbols: false,
  });
  const [generated, setGenerated] = useState("");

  const generate = () => {
    const charset = [
      options.upper ? CHARSET.upper : "",
      options.lower ? CHARSET.lower : "",
      options.numbers ? CHARSET.numbers : "",
      options.symbols ? CHARSET.symbols : "",
    ].join("");
    if (!charset) return;
    const arr = new Uint32Array(length);
    crypto.getRandomValues(arr);
    setGenerated(
      Array.from(arr)
        .map((n) => charset[n % charset.length])
        .join("")
    );
  };

  return (
    <div className="password-gen">
      <div className="password-gen__length">
        <span>Length: {length}</span>
        <Slider min={8} max={64} value={length} onChange={setLength} style={{ flex: 1 }} />
      </div>
      <Space wrap className="password-gen__options">
        {(["upper", "lower", "numbers", "symbols"] as const).map((k) => (
          <Checkbox
            key={k}
            checked={options[k]}
            onChange={(e) =>
              setOptions((p) => ({ ...p, [k]: e.target.checked }))
            }
          >
            {k.charAt(0).toUpperCase() + k.slice(1)}
          </Checkbox>
        ))}
      </Space>
      <Button type="default" onClick={generate} block>
        Generate
      </Button>
      {generated && (
        <div className="password-gen__result">
          <Input value={generated} readOnly />
          <Button type="primary" onClick={() => onUse(generated)}>
            Use this
          </Button>
        </div>
      )}
    </div>
  );
}
