import { describe, it, expect } from "vitest";
import { extractTables } from "../extract-tables";

describe("extractTables", () => {
  it("returns empty array for empty input", () => {
    expect(extractTables("")).toEqual([]);
    expect(extractTables("   ")).toEqual([]);
    expect(extractTables("\n\t")).toEqual([]);
  });

  it("extracts single FROM table", () => {
    expect(extractTables("SELECT * FROM users")).toEqual(["users"]);
  });

  it("extracts JOIN tables", () => {
    expect(extractTables("SELECT * FROM users JOIN orders ON users.id = orders.user_id")).toEqual([
      "orders",
      "users",
    ]);
  });

  it("supports schema.table notation", () => {
    expect(extractTables("SELECT * FROM public.users")).toEqual(["public.users"]);
    expect(
      extractTables("SELECT * FROM analytics.events JOIN public.users ON events.user_id = users.id")
    ).toEqual(["analytics.events", "public.users"]);
  });

  it("deduplicates table names", () => {
    expect(
      extractTables(
        "SELECT * FROM users JOIN orders ON users.id = orders.user_id JOIN users ON users.id = orders.admin_id"
      )
    ).toEqual(["orders", "users"]);
  });

  it("returns sorted results", () => {
    expect(extractTables("SELECT * FROM zebra JOIN alpha ON zebra.id = alpha.zid")).toEqual([
      "alpha",
      "zebra",
    ]);
  });

  it("ignores subqueries after FROM", () => {
    expect(extractTables("SELECT * FROM (SELECT id FROM orders) AS sub")).toEqual(["orders"]);
  });

  it("ignores single-line comments", () => {
    expect(extractTables("SELECT * FROM users -- FROM comments")).toEqual(["users"]);
  });

  it("ignores block comments", () => {
    expect(extractTables("SELECT * FROM users /* JOIN secret_table ON 1=1 */")).toEqual(["users"]);
  });

  it("ignores string literals", () => {
    expect(
      extractTables("SELECT * FROM users WHERE name = 'FROM fake_table'")
    ).toEqual(["users"]);
  });

  it("handles LEFT/RIGHT/INNER/OUTER JOIN variants", () => {
    const sql = `
      SELECT * FROM users
      LEFT JOIN orders ON users.id = orders.user_id
      RIGHT JOIN payments ON orders.id = payments.order_id
      INNER JOIN products ON orders.product_id = products.id
      FULL OUTER JOIN refunds ON payments.id = refunds.payment_id
    `;
    expect(extractTables(sql)).toEqual([
      "orders",
      "payments",
      "products",
      "refunds",
      "users",
    ]);
  });

  it("lowercases table names", () => {
    expect(extractTables("SELECT * FROM Users JOIN ORDERS ON Users.id = ORDERS.user_id")).toEqual([
      "orders",
      "users",
    ]);
  });
});
