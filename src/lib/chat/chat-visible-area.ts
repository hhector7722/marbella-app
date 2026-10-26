/**
 * Geometría del área visible para modales con teclado superpuesto.
 * Safari iOS reduce visualViewport; Chromium con interactive-widget
 * overlays-content puede conservar su alto y publicar VirtualKeyboard.
 */
export type ChatVisibleArea = {
  top:number;
  left:number;
  height:number;
  width:number;
};
type ViewportInput = ChatVisibleArea & {
  keyboardTop?:number | null;
  keyboardHeight?:number;
};
export function chatVisibleArea(input:ViewportInput):ChatVisibleArea {
  const top=Math.max(0,input.top);
  const left=Math.max(0,input.left);
  const width=Math.max(1,input.width);
  let height=Math.max(1,input.height);
  if((input.keyboardHeight??0)>0 && typeof input.keyboardTop==='number'){
    const fromTop=Math.max(1,input.keyboardTop-top);
    height=Math.min(height,fromTop);
  }
  return {top,left,height,width};
}
