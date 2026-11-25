import assert from "node:assert/strict";
import axe from "axe-core";
import { browserFixtures, launchBrowser } from "./support/browser.mjs";
import { signIn } from "./support/http.mjs";

const base=process.env.TEST_URL;
if(!base || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw Error("Use an isolated test instance and database.");
const browser=await launchBrowser();
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
const cookie=await signIn(base,"owner@vag-demo.test");
await page.context().addCookies(cookie.split("; ").map((item)=>{
  const index=item.indexOf("=");
  return {url:base,name:item.slice(0,index),value:item.slice(index+1)};
}));
const fixture=browserFixtures(page,base);

async function checkAxe(path){
  await page.evaluate(axe.source);
  const violations=await page.evaluate(async()=> (await window.axe.run(".log-content",{
    runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]},
  })).violations.map(({id,nodes})=>({id,targets:nodes.map(node=>node.target)})));
  assert.deepEqual(violations,[],path);
}

async function navigateBack(accept){
  const prompt=page.waitForEvent("dialog");
  await page.evaluate(()=>{ setTimeout(()=>history.back(),0); });
  const confirmation=await prompt;
  assert.equal(confirmation.message(),"Discard unsaved changes?");
  await (accept ? confirmation.accept() : confirmation.dismiss());
}

try{
  await fixture("employee",{name:"Mobile payroll fixture",weeklySalary:"3000",startedAt:"2025-11-01"});
  for(const lang of ["en","ar"]){
    await page.context().addCookies([
      {url:base,name:"vag-lang",value:lang},
      {url:base,name:"vag-theme",value:lang==="ar"?"light":"dark"},
    ]);
    for(const width of [320,375,390,414,768]){
      await page.setViewportSize({width,height:900});
      for(const path of ["/cash","/payroll","/inventory","/jobs"]){
        const response=await page.goto(base+path);
        assert.equal(response.status(),200,path);
        const layout=await page.evaluate(()=>({
          overflow:document.documentElement.scrollWidth>innerWidth,
          smallInputs:[...document.querySelectorAll('input:not([type="hidden"],[type="radio"],[type="checkbox"]),select,textarea')]
            .filter(element=>element.getClientRects().length && parseFloat(getComputedStyle(element).fontSize)<16)
            .map(element=>element.getAttribute("name") ?? element.className),
        }));
        assert.equal(layout.overflow,false,lang+" "+width+" "+path);
        assert.deepEqual(layout.smallInputs,[],lang+" "+width+" "+path);
        const icons=await page.locator(".log-topbar .icon-button").evaluateAll(elements=>elements.filter(element=>element.getClientRects().length)
          .map(element=>({width:element.offsetWidth,height:element.offsetHeight})));
        assert.ok(icons.every(({width,height})=>width>=44&&height>=44),lang+" "+width+" "+path);
        if(width===390 && path!=="/jobs") await checkAxe(lang+" "+path);
      }
    }
  }

  await page.context().addCookies([{url:base,name:"vag-lang",value:"en"}]);
  await page.setViewportSize({width:390,height:844});
  for(const [path,title,field] of [["/cash","Record paid expense","amount"],["/jobs","New job","receivedBy"]]){
    await page.goto(base+path);
    await page.getByRole("button",{name:title,exact:true}).click();
    const modal=page.getByRole("dialog",{name:title,exact:true});
    const input=modal.locator('input[name="'+field+'"]');
    await input.fill("123");
    const targets=await modal.getByRole("button",{name:"Close",exact:true}).evaluate(element=>({
      width:element.offsetWidth,height:element.offsetHeight,
    }));
    assert.ok(targets.width>=44&&targets.height>=44,title+" "+JSON.stringify(targets));
    assert.equal(await input.evaluate(element=>getComputedStyle(element).fontSize),"16px");
    await navigateBack(false);
    assert.equal(await input.inputValue(),"123");
    const escapePrompt=page.waitForEvent("dialog");
    const escape=page.keyboard.press("Escape");
    const confirmation=await escapePrompt;
    assert.equal(confirmation.message(),"Discard unsaved changes?");
    await confirmation.dismiss();
    await escape;
    assert.equal(await input.inputValue(),"123");
    await navigateBack(true);
    await modal.waitFor({state:"hidden"});
    assert.equal(new URL(page.url()).pathname,path);
  }
  console.log("PASS mobile viewports, accessibility, touch targets, and dirty dialog back behavior.");
} finally {
  await browser.close();
}
