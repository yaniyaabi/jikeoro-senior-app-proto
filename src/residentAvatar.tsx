import { useId } from "react";

export type ResidentAvatarConfig = {
  skin: "peach" | "sand" | "brown" | "deep";
  hair: "wave" | "short" | "bun" | "bob" | "hijab";
  hairColor: "espresso" | "walnut" | "amber" | "silver";
  top: "purple" | "yellow" | "mint" | "coral" | "blue";
  background: "pink" | "sky" | "lilac" | "lemon" | "mint";
  accessory: "none" | "round" | "square" | "freckles" | "beard" | "mustache" | "cap";
};

export const DEFAULT_RESIDENT_AVATAR: ResidentAvatarConfig = { skin: "deep", hair: "short", hairColor: "espresso", top: "coral", background: "pink", accessory: "none" };

const OPTIONS = {
  skin: ["peach", "sand", "brown", "deep"], hair: ["wave", "short", "bun", "bob", "hijab"], hairColor: ["espresso", "walnut", "amber", "silver"],
  top: ["purple", "yellow", "mint", "coral", "blue"], background: ["pink", "sky", "lilac", "lemon", "mint"], accessory: ["none", "round", "square", "freckles", "beard", "mustache", "cap"],
} as const;

export function normalizeResidentAvatar(value: unknown): ResidentAvatarConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_RESIDENT_AVATAR;
  const candidate = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(OPTIONS).map(([key, options]) => [key, options.includes(candidate[key] as never) ? candidate[key] : DEFAULT_RESIDENT_AVATAR[key as keyof ResidentAvatarConfig]])) as ResidentAvatarConfig;
}

const COLORS = {
  skin: { peach: "#f3b39d", sand: "#d98f68", brown: "#9b6248", deep: "#5b352f" },
  hair: { espresso: "#073845", walnut: "#7b5442", amber: "#ef6653", silver: "#eee8dc" },
  top: { purple: "#8b70d6", yellow: "#f6d64a", mint: "#78d7ad", coral: "#f06c64", blue: "#66a8df" },
};

export function ResidentAvatar({ config, greeting = false, label = "내 캐릭터" }: { config?: ResidentAvatarConfig | null; greeting?: boolean; label?: string }) {
  const avatar = normalizeResidentAvatar(config);
  const clipId = `app-avatar-${useId().replace(/:/g, "")}`;
  const skin = COLORS.skin[avatar.skin], hair = COLORS.hair[avatar.hairColor], top = COLORS.top[avatar.top];
  return <svg className={`resident-avatar${greeting ? " is-greeting" : ""}`} viewBox="0 0 160 160" role="img" aria-label={label}>
    <defs><clipPath id={clipId}><rect width="160" height="160" rx="26" /></clipPath></defs>
    <g clipPath={`url(#${clipId})`}>
      <rect width="160" height="160" fill="#fff" />
      <path d="M28 160c4-29 23-46 52-46s48 17 52 46z" fill={top} /><path d="M66 106h28v23c-8 7-20 7-28 0z" fill={skin} />
      {avatar.hair === "wave" && <path d="M39 66c0-34 17-52 42-52 28 0 43 20 43 54v49c-9 8-21 9-31 2H64c-10 7-23 5-29-3 8-16 4-33 4-50z" fill={hair} />}
      {avatar.hair === "bob" && <path d="M37 65c0-33 18-51 44-51 28 0 43 20 43 53v48c-9 8-22 10-33 3H67c-11 7-24 4-31-4z" fill={hair} />}
      {avatar.hair === "bun" && <><circle cx="105" cy="28" r="19" fill={hair} /><path d="M40 67c0-34 16-52 42-52 27 0 42 20 42 52v42H39z" fill={hair} /></>}
      {avatar.hair === "hijab" && <path d="M35 75c0-40 17-61 46-61 30 0 46 23 46 62v84H30c13-24 5-52 5-85z" fill={hair} />}
      <circle cx="42" cy="78" r="13" fill={skin} /><circle cx="118" cy="78" r="13" fill={skin} /><rect x="43" y="29" width="74" height="91" rx="37" fill={skin} />
      {avatar.hair === "short" && <path d="M42 61c0-31 15-48 40-48 27 0 40 18 39 50-13-2-24-9-30-20-11 12-27 18-49 18z" fill={hair} />}
      {avatar.hair === "wave" && <><path d="M42 62c0-31 15-49 40-49 26 0 40 17 39 48-13 0-24-7-31-18-11 13-27 19-48 19z" fill={hair} /><circle cx="45" cy="70" r="13" fill={hair} /><circle cx="116" cy="69" r="14" fill={hair} /></>}
      {avatar.hair === "bob" && <><path d="M42 62c0-31 15-49 40-49 25 0 39 17 39 48-15 1-27-6-35-18-9 11-24 18-44 19z" fill={hair} /><rect x="39" y="66" width="12" height="40" rx="6" fill={hair} /><rect x="110" y="65" width="12" height="41" rx="6" fill={hair} /></>}
      {avatar.hair === "bun" && <path d="M42 62c0-31 15-49 40-49 25 0 39 17 39 48-15 1-27-6-35-18-9 11-24 18-44 19z" fill={hair} />}
      {avatar.hair === "hijab" && <path d="M46 58c6-24 18-36 36-36 18 0 31 12 36 36-10-6-21-9-36-9s-27 3-36 9z" fill={hair} />}
      {avatar.accessory === "cap" && <><path d="M45 45c2-23 16-34 37-34 20 0 33 11 36 34z" fill="#ef6653" /><path d="M42 45h82c0 8-7 12-20 12H42z" fill="#d94f46" /></>}
      <ellipse cx="65" cy="76" rx="7" ry="9" fill="#fff" /><ellipse cx="96" cy="76" rx="7" ry="9" fill="#fff" /><circle cx="66" cy="77" r="3.2" fill="#073845" /><circle cx="95" cy="77" r="3.2" fill="#073845" />
      <path d="M80 78v9" fill="none" stroke="#b96e5c" strokeWidth="3" strokeLinecap="round" /><path d="M72 99c5 5 12 5 17 0" fill="none" stroke="#7f4038" strokeWidth="3.4" strokeLinecap="round" /><circle cx="58" cy="92" r="4" fill="#ef8d86" opacity=".62" /><circle cx="103" cy="92" r="4" fill="#ef8d86" opacity=".62" />
      {avatar.accessory === "round" && <g fill="none" stroke="#073845" strokeWidth="4"><circle cx="64" cy="76" r="14" /><circle cx="98" cy="76" r="14" /><path d="M78 76h6M50 73l-8-4M112 73l8-4" /></g>}
      {avatar.accessory === "square" && <g fill="none" stroke="#073845" strokeWidth="4"><rect x="49" y="62" width="28" height="25" rx="6" /><rect x="85" y="62" width="28" height="25" rx="6" /><path d="M77 74h8M49 70l-7-4M113 70l7-4" /></g>}
      {avatar.accessory === "freckles" && <g fill="#8f5042"><circle cx="57" cy="91" r="1.7" /><circle cx="63" cy="93" r="1.5" /><circle cx="98" cy="93" r="1.5" /><circle cx="104" cy="91" r="1.7" /></g>}
      {avatar.accessory === "beard" && <path d="M48 88c4 24 15 34 33 34s30-11 33-34c-8 8-17 11-27 10l-6 10-6-10c-11 1-20-2-27-10z" fill={hair} />}
      {avatar.accessory === "beard" && <path d="M74 99c4 3 10 3 14 0" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />}
      {avatar.accessory === "mustache" && <path d="M80 94c-5-6-14-5-18 1 5 6 13 7 19 2 6 5 14 4 19-2-4-6-13-7-20-1z" fill={hair} />}
      {greeting && <g className="avatar-wave"><path d="M119 126c8-6 15-17 19-28 2-7 9-6 9 0 1-8 8-8 9-1 2-6 8-4 7 2 3-3 7 1 5 6-4 16-11 27-23 35z" fill={skin} /><path d="M126 128c-4 7-8 16-9 31h31c-2-15-8-26-22-31z" fill={top} /></g>}
    </g>
  </svg>;
}

const PRESETS: Array<{ name: string; config: ResidentAvatarConfig }> = [
  { name: "씩씩한 지킴이", config: DEFAULT_RESIDENT_AVATAR },
  { name: "수염 난 지킴이", config: { skin: "sand", hair: "short", hairColor: "walnut", top: "blue", background: "sky", accessory: "beard" } },
  { name: "주근깨 지킴이", config: { skin: "peach", hair: "bob", hairColor: "amber", top: "mint", background: "mint", accessory: "freckles" } },
  { name: "안경 쓴 지킴이", config: { skin: "brown", hair: "bun", hairColor: "espresso", top: "purple", background: "lilac", accessory: "round" } },
  { name: "모자 쓴 지킴이", config: { skin: "deep", hair: "short", hairColor: "espresso", top: "yellow", background: "lemon", accessory: "cap" } },
  { name: "은빛 수염 지킴이", config: { skin: "sand", hair: "short", hairColor: "silver", top: "coral", background: "sky", accessory: "mustache" } },
];

export function ResidentAvatarPicker({ value, onChange }: { value: ResidentAvatarConfig; onChange: (value: ResidentAvatarConfig) => void }) {
  return <fieldset className="app-avatar-picker"><legend>내 캐릭터 고르기</legend><p>마음에 드는 동네지킴이를 하나 선택해주세요.</p><div role="radiogroup" aria-label="주민 캐릭터 선택">
    {PRESETS.map((preset, index) => { const selected = Object.keys(value).every((key) => value[key as keyof ResidentAvatarConfig] === preset.config[key as keyof ResidentAvatarConfig]); return <button type="button" role="radio" aria-checked={selected} aria-label={preset.name} className={selected ? "selected" : ""} key={preset.name} onClick={() => onChange(preset.config)}><ResidentAvatar config={preset.config} label="" /><span aria-hidden="true">{selected ? "✓" : index + 1}</span></button>; })}
  </div></fieldset>;
}
