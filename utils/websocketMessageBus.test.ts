import { describe, expect, test } from "bun:test";
import { WebSocketMessageBus } from "./websocketMessageBus";

type Message = { MessageType: string; command: string };
describe("WebSocket command delivery", () => {
  test("delivers every command in a same-tick burst, including Playstate", () => {
    const bus = new WebSocketMessageBus<Message>();
    const commands: string[] = [];
    bus.subscribe("*", (message) => commands.push(message.command));
    for (const command of [
      "Pause",
      "Seek",
      "SetSubtitleStreamIndex",
      "Unpause",
      "Stop",
    ])
      bus.dispatch({
        MessageType: command === "Seek" ? "Playstate" : "GeneralCommand",
        command,
      });
    expect(commands).toEqual([
      "Pause",
      "Seek",
      "SetSubtitleStreamIndex",
      "Unpause",
      "Stop",
    ]);
  });
  test("stale cleanup cannot remove a later subscription", () => {
    const bus = new WebSocketMessageBus<Message>();
    let count = 0;
    const old = bus.subscribe("GeneralCommand", () => {});
    old();
    bus.subscribe("GeneralCommand", () => count++);
    old();
    bus.dispatch({ MessageType: "GeneralCommand", command: "Pause" });
    expect(count).toBe(1);
  });
  test("isolates a failing subscriber and tolerates unsubscribe during dispatch", () => {
    let errors = 0;
    const bus = new WebSocketMessageBus<Message>(() => errors++);
    let count = 0;
    bus.subscribe("*", () => {
      throw new Error("bad subscriber");
    });
    const remove = bus.subscribe("GeneralCommand", () => {
      count++;
      remove();
    });
    bus.dispatch({ MessageType: "GeneralCommand", command: "Pause" });
    bus.dispatch({ MessageType: "GeneralCommand", command: "Unpause" });
    expect(count).toBe(1);
    expect(errors).toBe(2);
  });
});
