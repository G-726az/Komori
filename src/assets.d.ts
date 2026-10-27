/// <reference types="vite/client" />
// Images imported from the pages (Vite turns them into URLs).
declare module "*.png" {
  const url: string;
  export default url;
}
