import { describe, it, expect } from "vitest";
import { evalShowIf, evaluateLogic, applyLogicToData, nextStepForField, SHOW_IF_OPS } from "@/lib/ingest/logic";
import { form, submit, workspace } from "./helpers";

describe("logic operators across field types", () => {
  it("covers every declared operator", () => {
    expect(SHOW_IF_OPS.length).toBeGreaterThanOrEqual(14);
  });

  it.each([
    [{ field: "topic", op: "eq" as const, value: "Sales" }, { topic: "sales" }, true],
    [{ field: "topic", op: "neq" as const, value: "Sales" }, { topic: "Support" }, true],
    [{ field: "msg", op: "contains" as const, value: "demo" }, { msg: "Want a Demo" }, true],
    [{ field: "msg", op: "not_contains" as const, value: "spam" }, { msg: "hello" }, true],
    [{ field: "seats", op: "gt" as const, value: 10 }, { seats: "11" }, true],
    [{ field: "seats", op: "gte" as const, value: 10 }, { seats: "10" }, true],
    [{ field: "seats", op: "lt" as const, value: 10 }, { seats: "9" }, true],
    [{ field: "seats", op: "lte" as const, value: 10 }, { seats: "10" }, true],
    [{ field: "plan", op: "in" as const, value: ["pro", "enterprise"] }, { plan: "Pro" }, true],
    [{ field: "plan", op: "not_in" as const, value: "free,trial" }, { plan: "pro" }, true],
    [{ field: "email", op: "filled" as const }, { email: "a@b.c" }, true],
    [{ field: "email", op: "empty" as const }, {}, true],
    [{ field: "code", op: "matches" as const, value: "^[A-Z]{2}\\d+$" }, { code: "AB12" }, true],
    [{ field: "email", op: "domain_is" as const, value: "stripe.com" }, { email: "ada@stripe.com" }, true],
    [{ field: "email", op: "domain_matches" as const, value: "stripe\\.(com|io)" }, { email: "ada@stripe.io" }, true],
    // checkbox / multiselect filled
    [{ field: "interests", op: "filled" as const }, { interests: ["a", "b"] }, true],
    [{ field: "interests", op: "empty" as const }, { interests: [] }, true],
    // rating
    [{ field: "nps", op: "gte" as const, value: 8 }, { nps: 9 }, true],
  ])("%j → %s", (cond, data, expected) => {
    expect(evalShowIf(cond, data)).toBe(expected);
  });
});

describe("actions: goto / show / hide / skip / end / set_value / route", () => {
  const fields = [
    { name: "intent", type: "button", goto: { Sales: "sales-step", Support: "support-step" } },
    { name: "seats", type: "number", showIf: { field: "intent", op: "eq" as const, value: "Sales" } },
    { name: "order_id", type: "text", hidden: true },
    { name: "segment", type: "hidden" },
  ];

  it("choice buttons jump to steps", () => {
    expect(nextStepForField(fields[0], "Sales")).toBe("sales-step");
    expect(nextStepForField(fields[0], "support")).toBe("support-step");
  });

  it("evaluateLogic applies show/hide/set_value/route/end", () => {
    const rules = [
      {
        when: { field: "intent", op: "eq" as const, value: "Sales" },
        actions: [
          { type: "show_field" as const, target: "order_id" },
          { type: "set_value" as const, target: "segment", value: "sales" },
          { type: "route" as const, assignTo: ["ava@x.io"], bookingUrl: "https://cal.com/ava" },
          { type: "goto_step" as const, target: "sales-step" },
        ],
      },
      {
        when: { field: "intent", op: "eq" as const, value: "Done" },
        actions: [{ type: "end" as const }],
      },
    ];
    const r = evaluateLogic(fields, { intent: "Sales" }, { rules, steps: [{ id: "start" }, { id: "sales-step" }], currentStep: "start" });
    expect(r.visible.has("seats")).toBe(true);
    expect(r.visible.has("order_id")).toBe(true);
    expect(r.setValues.segment).toBe("sales");
    expect(r.route?.assignTo).toEqual(["ava@x.io"]);
    expect(r.step).toBe("sales-step");

    const ended = evaluateLogic(fields, { intent: "Done" }, { rules });
    expect(ended.ended).toBe(true);
  });

  it("applyLogicToData drops hidden values and applies set_value", () => {
    const { data, logic } = applyLogicToData(
      [
        { name: "topic", type: "select" },
        { name: "budget", type: "text", showIf: { field: "topic", op: "eq", value: "Sales" } },
        { name: "src", type: "hidden" },
      ],
      { topic: "Support", budget: "should-drop", src: "old" },
      {
        rules: [{ when: { field: "topic", op: "eq", value: "Support" }, actions: [{ type: "set_value", target: "src", value: "support-flow" }] }],
      },
    );
    expect(data.budget).toBeUndefined();
    expect(data.src).toBe("support-flow");
    expect(logic.hidden.has("budget")).toBe(true);
  });
});

describe("ingest respects branching for new field types", () => {
  const { ws } = workspace("LogicIngest");
  it("does not require hidden checkbox/radio fields", async () => {
    const f = form(ws, {
      schemaMode: "validate",
      fields: [
        { name: "intent", type: "button", required: true, options: ["Sales", "Support"] },
        { name: "seats", type: "number", required: true, showIf: { field: "intent", op: "eq", value: "Sales" } },
        { name: "tags", type: "checkbox", required: true, options: ["a", "b"], showIf: { field: "intent", op: "eq", value: "Sales" } },
        { name: "email", type: "email", required: true },
      ],
    });
    const support = await submit(f.id, { intent: "Support", email: "a@b.co" });
    expect(support.status).toBe(200);
    const salesMissing = await submit(f.id, { intent: "Sales", email: "a@b.co" });
    expect(salesMissing.status).toBe(422);
    const salesOk = await submit(f.id, { intent: "Sales", seats: 12, tags: ["a"], email: "a@b.co" });
    expect(salesOk.status).toBe(200);
  });
});
