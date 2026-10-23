type CommunityReview = { id: number; professorId: number; professorSlug: string; professor: string; course: string | null; courseStatus?: string; term: string | null;
  rating: number | null; text: string; createdAt: string; editedAt: string | null; authorLabel: string };
type CommunityPage = { stats: { reviewCount: number; professorCount: number; ratingCount: number; averageRating: number | null };
  reviews: CommunityReview[]; nextCursor: number | null };

function initNativeCommunity() {
  const root=document.querySelector<HTMLElement>("[data-native-community]");
  if(!root || root.dataset.bound) return;
  root.dataset.bound="true";
  const form=root.querySelector<HTMLFormElement>("[data-native-search]")!;
  const input=form.elements.namedItem("q") as HTMLInputElement;
  const list=root.querySelector<HTMLElement>("[data-native-list]")!;
  const status=root.querySelector<HTMLElement>("[data-native-status]")!;
  const empty=root.querySelector<HTMLElement>("[data-native-empty]")!;
  const more=root.querySelector<HTMLButtonElement>("[data-native-more]")!;
  const retry=root.querySelector<HTMLButtonElement>("[data-native-retry]")!;
  const url=new URL(location.href);
  let professorId=/^[1-9]\d*$/.test(url.searchParams.get("professorId")??"") ? url.searchParams.get("professorId") : null;
  const filter=root.querySelector<HTMLElement>("[data-native-filter]")!;
  filter.hidden=!professorId&&!url.searchParams.get("q");
  input.value=(url.searchParams.get("q")??"").slice(0,100);
  let cursor:number|null=null, controller:AbortController|null=null, busy=false;
  const seen=new Set<number>();
  function setFilters(id:string|null,query:string,push=true) {
    professorId=id;input.value=query;filter.hidden=!id&&!query.trim();cursor=null;
    if(push){
      const next=new URL(location.href);next.searchParams.delete("q");next.searchParams.delete("professorId");
      if(query.trim())next.searchParams.set("q",query.trim());
      if(id)next.searchParams.set("professorId",id);
      history.pushState(history.state,"",next);
    }
    void load();
  }
  const element=<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,text?:string)=>{
    const node=document.createElement(tag); node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const icon=(name:"user"|"star"|"book-open"|"calendar-days"|"arrow-right")=>{
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("width","16");svg.setAttribute("height","16");
    svg.setAttribute("aria-hidden","true");svg.setAttribute("focusable","false");
    const use=document.createElementNS("http://www.w3.org/2000/svg","use");
    use.setAttribute("href",`/assets/lucide.svg#${name}`);svg.append(use);return svg;
  };
  function card(review:CommunityReview) {
    const article=element("article","community__card");
    const top=element("div","community__card-top"),author=element("span","community__author");
    const avatar=element("span","community__avatar");avatar.append(icon("user"));
    author.append(avatar,document.createTextNode(review.authorLabel));
    const scoreWrap=element("div","community__score-wrap");
    const score=element("span",review.rating===null?"community__score community__score--empty":"community__score");
    score.setAttribute("aria-label",review.rating===null?"Sin puntuación al profesor":`Valoración al profesor: ${review.rating} de 10`);
    if(review.rating===null)score.textContent="Sin puntuación";
    else {
      scoreWrap.append(element("span","community__score-label","Valoración al profesor"));
      score.append(icon("star"),document.createTextNode(review.rating.toFixed(1)),element("small","","/10"));
    }
    scoreWrap.append(score);top.append(author,scoreWrap);
    const heading=element("h3","community__professor",review.professor);
    const context=element("div","community__context");
    const course=element("span","community__chip");
    course.append(icon("book-open"),document.createTextNode(review.course?`Curso: ${review.course}`:review.courseStatus==="pending"?"Curso por confirmar":"Curso no indicado"));
    context.append(course);
    if(review.term){
      const term=element("span","community__chip");term.append(icon("calendar-days"),document.createTextNode(`Ciclo ${review.term}`));context.append(term);
    }
    const bottom=element("div","community__card-bottom"),date=element("time","community__date");
    const published=new Date(review.createdAt);
    if(Number.isFinite(published.getTime())) {
      date.dateTime=published.toISOString();
      date.textContent=`Publicada el ${new Intl.DateTimeFormat("es-PE",{day:"numeric",month:"short",year:"numeric",timeZone:"America/Lima"}).format(published)}${review.editedAt?" · Editada":""}`;
      bottom.append(date);
    }
    const professor=element("a","community__professor-link","Ver reseñas del profesor");
    professor.href=`/profes/upc/${encodeURIComponent(review.professorSlug)}/`;
    professor.setAttribute("aria-label",`Ver reseñas de ${review.professor}`);
    professor.append(icon("arrow-right"));
    bottom.append(professor);
    article.append(top,heading,context,element("p","community__text",review.text),bottom);
    return article;
  }
  async function load(append=false) {
    if(append&&busy)return;
    controller?.abort(); controller=new AbortController(); const current=controller;
    busy=true;more.disabled=true;retry.hidden=true;status.textContent=append?"Cargando más reseñas…":"Cargando reseñas…";
    if(!append){list.replaceChildren();seen.clear();empty.hidden=true;more.hidden=true;}
    try{
      const query=input.value.trim();
      const params=new URLSearchParams({limit:"12"});
      if(query)params.set("q",query);
      if(professorId)params.set("professorId",professorId);
      if(append&&cursor!==null)params.set("beforeId",String(cursor));
      const response=await fetch(`/api/app/profes/community/?${params}`,{credentials:"omit",signal:AbortSignal.any([current.signal,AbortSignal.timeout(10000)])});
      const data=await response.json() as CommunityPage & {error?:string};
      if(!response.ok)throw new Error(data.error??"No pudimos cargar las reseñas.");
      if(!root!.isConnected||current.signal.aborted)return;
      if(!Array.isArray(data.reviews)||!data.stats)throw new Error("No pudimos cargar las reseñas.");
      root!.querySelector<HTMLElement>("[data-native-count]")!.textContent=String(data.stats.reviewCount);
      root!.querySelector<HTMLElement>("[data-native-count-label]")!.textContent=data.stats.reviewCount===1?"reseña":"reseñas";
      root!.querySelector<HTMLElement>("[data-native-professors]")!.textContent=String(data.stats.professorCount);
      root!.querySelector<HTMLElement>("[data-native-professors-label]")!.textContent=data.stats.professorCount===1?"profesor":"profesores";
      root!.querySelector<HTMLElement>("[data-native-rating-stat]")!.hidden=!professorId||!data.stats.ratingCount;
      root!.querySelector<HTMLElement>("[data-native-rating]")!.textContent=data.stats.averageRating===null?"Sin puntuación":`${data.stats.averageRating.toFixed(1)}/10`;
      root!.querySelector<HTMLElement>("[data-native-rating-label]")!.textContent=`media de ${data.stats.ratingCount} ${data.stats.ratingCount===1?"valoración":"valoraciones"}`;
      root!.querySelector<HTMLElement>("[data-native-filter-label]")!.textContent=professorId
        ? data.reviews[0]?`Profesor: ${data.reviews[0].professor}`:"Reseñas de este profesor"
        : `Búsqueda: «${query}»`;
      root!.querySelector<HTMLElement>("#community-reviews-heading")!.textContent=professorId?"Reseñas del profesor":query?"Resultados de tu búsqueda":"Reseñas recientes";
      for(const review of data.reviews){if(seen.has(review.id))continue;seen.add(review.id);list.append(card(review));}
      cursor=data.nextCursor;more.hidden=cursor===null;empty.hidden=seen.size>0;
      status.textContent=seen.size?`Mostrando ${seen.size} de ${data.stats.reviewCount} ${data.stats.reviewCount===1?"reseña":"reseñas"}.`:"No hay reseñas que coincidan con tu búsqueda.";
    }catch(error){
      if(current.signal.aborted)return;
      status.textContent=error instanceof Error&&error.name!=="TimeoutError"?error.message:"La carga tardó demasiado. Vuelve a intentarlo.";
      retry.hidden=false;retry.onclick=()=>{void load(append);};
    }finally{if(controller===current){busy=false;more.disabled=false;}}
  }
  form.addEventListener("submit",event=>{event.preventDefault();if(!form.reportValidity())return;
    setFilters(null,input.value.trim());});
  filter.querySelector("a")!.addEventListener("click",event=>{
    if(event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();setFilters(null,"");
  });
  const onPopState=()=>{
    const state=new URL(location.href),id=state.searchParams.get("professorId");
    setFilters(id&&/^[1-9]\d*$/.test(id)?id:null,(state.searchParams.get("q")??"").slice(0,100),false);
  };
  window.addEventListener("popstate",onPopState);
  more.addEventListener("click",()=>{void load(true);});
  document.addEventListener("astro:before-swap",()=>{controller?.abort();window.removeEventListener("popstate",onPopState);},{once:true});
  void load();
}
initNativeCommunity();
document.addEventListener("astro:page-load",initNativeCommunity);
