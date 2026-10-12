export const homeUrl = import.meta.env.BASE_URL;
export const adminUrl = homeUrl + 'admin/';
export const resultUrl = (id:string) => new URL(homeUrl + '?r=' + encodeURIComponent(id), location.origin).href;
