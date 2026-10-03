import {describe,expect,it} from "vitest";
import {billingText} from "./billingLocale";
import type {AppLocale} from "./i18n";

describe("billing copy",()=>{
  it.each(["ja","en","de","es","fr","ko","pt-BR","zh-CN","zh-TW"] as AppLocale[])("has complete purchase and readiness messages in %s",locale=>{
    const copy=billingText(locale);
    expect(Object.keys(copy).sort()).toEqual(["manage","opened","failed","login","checking","unavailable","checkFailed"].sort());
    expect(Object.values(copy).every(value=>value.trim().length>0)).toBe(true);
    if(locale==="en")expect(Object.values(copy).join(" ")).not.toMatch(/[ぁ-んァ-ン一-龯]/);
  });
});
