interface Props {
  size?: number;
  showText?: boolean;
  onClick?: () => void;
}

export default function Logo({ size = 42, showText = true, onClick }: Props) {
  return (
    <div className="brand" onClick={onClick} role={onClick ? "button" : undefined}>
      <img src="/logo.svg" alt="LUFF AGENT logo" width={size} height={size} />
      {showText && (
        <div className="brand-text">
          <div className="brand-name">
            LUFF <span>AGENT</span>
          </div>
          <div className="brand-tag">Realtime Sniper</div>
        </div>
      )}
    </div>
  );
}
