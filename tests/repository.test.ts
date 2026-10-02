import { beforeEach, describe, it, expect, vi } from "vitest";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("../src/data/client", () => ({ backend: () => ({ rpc: invoke }) }));
import { save, lifecycle, read } from "../src/data/repository";
import type { RecordRow } from "../src/domain/model";
const event = "22222222-2222-4222-8222-222222222222",
  id = "11111111-1111-4111-8111-111111111111";
const row: RecordRow = { id, event_id: event, version: 7, is_deleted: false };
beforeEach(() => invoke.mockReset());
describe("authorized RPC writes", () => {
  it("sends the exact CAS version, scope and stable request identity", async () => {
    invoke.mockResolvedValue({ data: id, error: null });
    await save(event, "person", { first_name: "A" }, id, row);
    expect(invoke).toHaveBeenCalledWith("save_person", {
      p_event_id: event,
      p_request_id: id,
      p_id: id,
      p_expected_version: 7,
      p_fields: { first_name: "A" },
    });
  });
  it("creates through the RPC without a fabricated record id", async () => {
    invoke.mockResolvedValue({ data: id, error: null });
    await save(event, "task", { title: "Task" }, id);
    expect(invoke.mock.calls[0][1]).toMatchObject({
      p_id: null,
      p_expected_version: null,
    });
  });
  it("keeps conflict failures visible", async () => {
    invoke.mockResolvedValue({ data: null, error: { code: "40001" } });
    await expect(save(event, "person", {}, id, row)).rejects.toMatchObject({
      code: "40001",
    });
  });
  it("refuses cross-event writes before contacting server", async () => {
    await expect(save(id, "person", {}, id, row)).rejects.toThrow("scope");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("uses dedicated history-preserving transport lifecycle", async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    await lifecycle(event, "trip", row, true);
    expect(invoke).toHaveBeenCalledWith("delete_trip", {
      p_event_id: event,
      p_id: id,
      p_expected_version: 7,
    });
  });
  it("uses explicit restore for people", async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    await lifecycle(event, "person", row, false);
    expect(invoke.mock.calls[0][1]).toMatchObject({ p_deleted: false });
  });
  it("loads passport information only through the protected detail RPC", async () => {
    invoke.mockResolvedValue({ data: row, error: null });
    await read(event, "person", id);
    expect(invoke).toHaveBeenCalledWith("read_person", {
      p_event_id: event,
      p_id: id,
    });
  });
});
