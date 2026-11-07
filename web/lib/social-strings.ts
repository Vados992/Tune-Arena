import { languages, type Locale } from "./locale";
const text={
  feed:"Community feed|Feed da comunidade|Feed de la comunidad|Лента сообщества|Стрічка спільноти|Fil de la communauté",
  search:"Search builds and nicknames|Pesquisar projetos e alcunhas|Buscar proyectos y alias|Поиск машин и никнеймов|Пошук авто та нікнеймів|Rechercher projets et pseudos",
  all:"All builds|Todos os projetos|Todos los proyectos|Все работы|Усі роботи|Tous les projets",
  mine:"My builds|Os meus projetos|Mis proyectos|Мои работы|Мої роботи|Mes projets",
  new:"Latest first|Mais recentes|Más recientes|Сначала новые|Спочатку нові|Plus récents",
  popular:"Most liked|Mais votados|Más votados|Больше голосов|Більше голосів|Plus aimés",
  sort:"Sort the feed|Ordenar o feed|Ordenar el feed|Порядок в ленте|Порядок у стрічці|Trier le fil",
  composer:"What’s new in your Garage?|Novidades na tua Garagem?|¿Qué hay de nuevo en tu Garaje?|Что нового в твоём Гараже?|Що нового у твоєму Гаражі?|Quoi de neuf dans ton Garage ?",
  addPhoto:"Photo + build|Foto + projeto|Foto + proyecto|Фото + проект|Фото + проєкт|Photo + projet",
  club:"Tuning club|Clube de tuning|Club tuning|Тюнинг-клуб|Тюнінг-клуб|Club tuning",
  clubText:"Your crew. Your next upgrade.|Os teus amigos. O próximo nível.|Tus amigos. Tu próxima mejora.|Твоя команда. Следующая прокачка.|Твоя команда. Наступне покращення.|Ton équipe. Ta prochaine amélioration.",
  clubOffer:"3 active friends = 30 days of Premium|3 amigos ativos = 30 dias de Premium|3 amigos activos = 30 días de Premium|3 активных друга = 30 дней Премиума|3 активних друзів = 30 днів Преміуму|3 amis actifs = 30 jours de Premium",
  clubOpen:"Invite your crew|Convidar amigos|Invitar amigos|Пригласить команду|Запросити команду|Inviter ton équipe",
  spotlight:"On the starting grid|Na grelha de partida|En la parrilla de salida|На стартовой решётке|На стартовій решітці|Sur la grille de départ",
  how:"How the arena works|Como funciona a arena|Cómo funciona la arena|Как устроена арена|Як працює арена|Comment fonctionne l’arène",
  step1:"Show your build|Mostra o teu projeto|Muestra tu proyecto|Покажи свой проект|Покажи свій проєкт|Montre ton projet",
  step2:"Let the community vote|A comunidade vota|La comunidad vota|Собери голоса сообщества|Збери голоси спільноти|La communauté vote",
  step3:"Meet the next winner|Descobre o vencedor|Descubre al ganador|Узнай победителя раунда|Дізнайся переможця|Découvre le gagnant",
  noMatches:"No builds match your search.|Nenhum projeto encontrado.|No se encontraron proyectos.|По этому запросу работ нет.|За цим запитом робіт немає.|Aucun projet ne correspond.",
  reset:"Show all builds|Mostrar todos|Mostrar todos|Показать все работы|Показати всі роботи|Tout afficher",
  culture:"BUILDS. PEOPLE. CULTURE.|PROJETOS. PESSOAS. CULTURA.|PROYECTOS. PERSONAS. CULTURA.|ПРОЕКТЫ. ЛЮДИ. КУЛЬТУРА.|ПРОЄКТИ. ЛЮДИ. КУЛЬТУРА.|PROJETS. PASSION. CULTURE.",
  explore:"Explore the garage|Explorar a garagem|Explorar el garaje|Загляни в Гараж|Зазирни в Гараж|Explore le Garage",
  pilot:"Tuning community|Comunidade de tuning|Comunidad de tuning|Тюнинг-сообщество|Тюнінг-спільнота|Communauté tuning",
  back:"Back to feed|Voltar ao feed|Volver al feed|Вернуться в ленту|Повернутися у стрічку|Retour au fil",
  roundStats:"This round|Esta ronda|Esta ronda|В этом раунде|У цьому раунді|Cette manche",
} as const;
export function socialText(locale:Locale) {
  return Object.fromEntries(Object.entries(text).map(([key,value])=>[key,value.split("|")[languages.indexOf(locale)]])) as Record<keyof typeof text,string>;
}
