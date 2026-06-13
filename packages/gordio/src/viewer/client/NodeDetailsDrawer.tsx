import { formatKindLabel, type NodeDetails } from "./node-details";

export function NodeDetailsDrawer({
  details,
  onClose,
}: {
  details: NodeDetails;
  onClose: () => void;
}) {
  const outgoing = details.connections.filter((connection) => connection.direction === "outgoing");
  const incoming = details.connections.filter((connection) => connection.direction === "incoming");

  return (
    <aside className="gordio-details-drawer" aria-label="Node details">
      <header className="gordio-details-header">
        <div>
          <p className="gordio-details-eyebrow">{details.kindLabel}</p>
          <h2 className="gordio-details-title">{details.title}</h2>
        </div>
        <button
          type="button"
          className="gordio-details-close"
          aria-label="Close details"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <section className="gordio-details-section">
        <h3>Context</h3>
        <dl className="gordio-details-meta">
          <div>
            <dt>Box</dt>
            <dd>{details.boxTitle}</dd>
          </div>
          {details.boxPackageName ? (
            <div>
              <dt>Package</dt>
              <dd>{details.boxPackageName}</dd>
            </div>
          ) : null}
          {details.slotTitle ? (
            <div>
              <dt>Slot</dt>
              <dd>{details.slotTitle}</dd>
            </div>
          ) : null}
          <div>
            <dt>Id</dt>
            <dd className="gordio-details-mono">{details.nodeId}</dd>
          </div>
        </dl>
      </section>

      <section className="gordio-details-section">
        <h3>Connections</h3>
        {details.connections.length === 0 ? (
          <p className="gordio-details-empty">No connected edges.</p>
        ) : (
          <>
            {outgoing.length > 0 ? (
              <ConnectionGroup direction="outgoing" connections={outgoing} />
            ) : null}
            {incoming.length > 0 ? (
              <ConnectionGroup direction="incoming" connections={incoming} />
            ) : null}
          </>
        )}
      </section>
    </aside>
  );
}

function ConnectionGroup({
  direction,
  connections,
}: {
  direction: "outgoing" | "incoming";
  connections: NodeDetails["connections"];
}) {
  return (
    <div className="gordio-details-connection-group">
      <h4>{direction === "outgoing" ? "Outgoing" : "Incoming"}</h4>
      <ul className="gordio-details-connection-list">
        {connections.map((connection) => (
          <li key={`${direction}:${connection.peerId}`}>
            <span className="gordio-details-edge-peer">{connection.peerTitle}</span>
            {connection.peerKind ? (
              <span className="gordio-details-edge-kind">
                {formatKindLabel(connection.peerKind)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
