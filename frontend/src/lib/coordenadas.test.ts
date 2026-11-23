import { describe, expect, it } from "vitest";
import { lerCoordenada } from "./coordenadas";

describe("lerCoordenada", () => {
  it("lê texto com ponto ou vírgula decimal", () => {
    expect(lerCoordenada("-18.5789, -46.5181")).toEqual({ latitude: -18.5789, longitude: -46.5181 });
    expect(lerCoordenada("-18,5789 -46,5181")).toEqual({ latitude: -18.5789, longitude: -46.5181 });
    expect(lerCoordenada("-18.5789 -46.5181")).toEqual({ latitude: -18.5789, longitude: -46.5181 });
    expect(lerCoordenada("-18,5789; -46,5181")).toEqual({ latitude: -18.5789, longitude: -46.5181 });
  });

  it("lê links do Google Maps", () => {
    expect(lerCoordenada("https://www.google.com/maps/@-18.5789,-46.5181,17z")).toEqual({ latitude: -18.5789, longitude: -46.5181 });
    expect(lerCoordenada("https://www.google.com/maps/place/Fazenda/@-18.57,-46.51,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-18.5791!4d-46.5179")).toEqual({ latitude: -18.5791, longitude: -46.5179 });
    expect(lerCoordenada("https://maps.google.com/?q=-18.5789,-46.5181")).toEqual({ latitude: -18.5789, longitude: -46.5181 });
  });

  it("recusa links curtos, valores fora do intervalo e texto solto", () => {
    expect(lerCoordenada("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(lerCoordenada("95, 10")).toBeNull();
    expect(lerCoordenada("Patos de Minas")).toBeNull();
    expect(lerCoordenada("0, 0")).toBeNull();
    expect(lerCoordenada("")).toBeNull();
  });
});
