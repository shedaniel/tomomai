import type { ReactNode } from "react";
import styles from "./phpinfo.module.css";

type Row = readonly [string, ReactNode];

function Table({ heading, rows, columns }: { heading?: readonly string[]; rows: readonly (readonly ReactNode[])[]; columns?: number }) {
  return (
    <table className={styles.table}>
      <tbody>
        {heading && <tr className={styles.h}>{heading.map(cell => <th key={cell}>{cell}</th>)}</tr>}
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className={cellIndex === 0 ? styles.e : styles.v} colSpan={columns && row.length === 1 ? columns : undefined}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PhpInfoPage({ version, logo, children }: { version: string; logo: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <table className={styles.table}>
        <tbody>
          <tr className={styles.h}>
            <td>
              <span className={styles.logo} aria-hidden>{logo}</span>
              <h1 className={styles.p}>{version}</h1>
            </td>
          </tr>
        </tbody>
      </table>
      {children}
    </div>
  );
}

export function PhpInfoRows({ rows }: { rows: readonly Row[] }) {
  return <Table rows={rows} />;
}

export function PhpInfoGrid({ heading, rows }: { heading: readonly string[]; rows: readonly (readonly ReactNode[])[] }) {
  return <Table heading={heading} rows={rows} />;
}

export function PhpInfoHeading({ children }: { children: ReactNode }) {
  return <h2 className={styles.h2}>{children}</h2>;
}

export function PhpInfoBox({ children }: { children: ReactNode }) {
  return <table className={styles.table}><tbody><tr><td className={styles.v}>{children}</td></tr></tbody></table>;
}

export function PhpInfoRule() {
  return <hr className={styles.hr} />;
}
