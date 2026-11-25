"use client";

import { useId, useLayoutEffect, useRef, type RefObject } from "react";
import { translate, type Language } from "@/lib/locale";

const marker = "vagDialog";

export function useDialogDismiss(dialog: RefObject<HTMLDialogElement | null>, active: boolean, lang: Language, dirty: boolean, blocked: boolean) {
  const id = useId();
  const rules = useRef({dirty,blocked,lang});
  const afterBack = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { rules.current={dirty,blocked,lang}; },[dirty,blocked,lang]);

  const mayDismiss = () => !rules.current.blocked &&
    (!rules.current.dirty || window.confirm(translate(rules.current.lang,"Discard unsaved changes?")));

  useLayoutEffect(() => {
    if (!active) return;
    const url = window.location.href;
    const enter = () => history.pushState({...history.state,[marker]:id},"",url);
    enter();
    const onBack = () => {
      if (history.state?.[marker]===id) return;
      if (afterBack.current) {
        const finish=afterBack.current;
        afterBack.current=null;
        finish();
      } else if (dialog.current?.open) {
        if (mayDismiss()) dialog.current.close();
        else enter();
      }
    };
    window.addEventListener("popstate",onBack);
    return () => {
      window.removeEventListener("popstate",onBack);
      if (history.state?.[marker]===id) {
        const state={...history.state};
        delete state[marker];
        history.replaceState(state,"",window.location.href);
      }
      afterBack.current=null;
    };
  // The listener reads the latest form state from rules.
  },[active,dialog,id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!active || (!dirty && !blocked)) return;
    const beforeUnload = (event:BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue="";
    };
    window.addEventListener("beforeunload",beforeUnload);
    return () => window.removeEventListener("beforeunload",beforeUnload);
  },[active,dirty,blocked]);

  function finish(navigate?: () => void) {
    if (afterBack.current) return;
    const close = () => {
      dialog.current?.close();
      navigate?.();
    };
    if (history.state?.[marker]===id) {
      afterBack.current=close;
      history.back();
    } else close();
  }

  return {finish,dismiss:(navigate?:()=>void)=>{if(mayDismiss()) finish(navigate);}};
}
