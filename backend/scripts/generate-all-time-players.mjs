/**
 * Build a 10,000-player all-time catalog with a quality pyramid:
 * perfect / good / med / bad / really_bad
 *
 * Curated legends stay as the elite core. The rest are era-club career years
 * (not FIFA cards) so the draft pool has stars and journeymen.
 *
 * Run: node scripts/generate-all-time-players.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data");
const TARGET = 10_000;

const QUOTAS = {
  perfect: 280,
  good: 1220,
  med: 4000,
  bad: 3000,
  really_bad: 1500,
};

const RANGES = {
  perfect: [90, 97],
  good: [80, 89],
  med: [70, 79],
  bad: [60, 69],
  really_bad: [45, 59],
};

/** Career years used when generating each quality band. */
const YEAR_RANGES = {
  perfect: [1954, 2026],
  good: [1958, 2026],
  med: [2000, 2026],
  bad: [1958, 2026],
  really_bad: [1958, 2026],
};

const POSITIONS = [
  ["GK", 8],
  ["CB", 16],
  ["LB", 8],
  ["RB", 8],
  ["CDM", 9],
  ["CM", 13],
  ["CAM", 8],
  ["LM", 5],
  ["RM", 5],
  ["LW", 6],
  ["RW", 6],
  ["ST", 8],
];

const CLUBS = [
  ["Real Madrid", "La Liga", "Spain", 1955, 2026],
  ["Barcelona", "La Liga", "Spain", 1955, 2026],
  ["Atlético Madrid", "La Liga", "Spain", 1960, 2026],
  ["Valencia", "La Liga", "Spain", 1965, 2026],
  ["Sevilla", "La Liga", "Spain", 1970, 2026],
  ["Athletic Bilbao", "La Liga", "Spain", 1955, 2026],
  ["Manchester United", "England", "England", 1956, 2026],
  ["Liverpool", "England", "England", 1962, 2026],
  ["Arsenal", "England", "England", 1968, 2026],
  ["Chelsea", "England", "England", 1970, 2026],
  ["Manchester City", "England", "England", 1968, 2026],
  ["Tottenham", "England", "England", 1961, 2026],
  ["Everton", "England", "England", 1960, 2026],
  ["Leeds United", "England", "England", 1965, 2004],
  ["Nottingham Forest", "England", "England", 1975, 1995],
  ["Aston Villa", "England", "England", 1970, 2026],
  ["West Ham", "England", "England", 1964, 2026],
  ["Newcastle", "England", "England", 1965, 2026],
  ["Bayern Munich", "Bundesliga", "Germany", 1965, 2026],
  ["Borussia Dortmund", "Bundesliga", "Germany", 1966, 2026],
  ["Borussia Mönchengladbach", "Bundesliga", "Germany", 1970, 2026],
  ["Hamburg", "Bundesliga", "Germany", 1976, 2010],
  ["Werder Bremen", "Bundesliga", "Germany", 1980, 2026],
  ["Bayer Leverkusen", "Bundesliga", "Germany", 1988, 2026],
  ["Schalke", "Bundesliga", "Germany", 1972, 2020],
  ["Juventus", "Serie A", "Italy", 1958, 2026],
  ["Milan", "Serie A", "Italy", 1955, 2026],
  ["Inter", "Serie A", "Italy", 1955, 2026],
  ["Roma", "Serie A", "Italy", 1960, 2026],
  ["Napoli", "Serie A", "Italy", 1984, 2026],
  ["Lazio", "Serie A", "Italy", 1970, 2026],
  ["Fiorentina", "Serie A", "Italy", 1956, 2026],
  ["Parma", "Serie A", "Italy", 1992, 2004],
  ["Sampdoria", "Serie A", "Italy", 1988, 2000],
  ["Ajax", "Eredivisie", "Netherlands", 1966, 2026],
  ["PSV", "Eredivisie", "Netherlands", 1970, 2026],
  ["Feyenoord", "Eredivisie", "Netherlands", 1965, 2026],
  ["Benfica", "Portugal", "Portugal", 1960, 2026],
  ["Porto", "Portugal", "Portugal", 1978, 2026],
  ["Sporting CP", "Portugal", "Portugal", 1962, 2026],
  ["PSG", "Ligue 1", "France", 1982, 2026],
  ["Marseille", "Ligue 1", "France", 1970, 2026],
  ["Lyon", "Ligue 1", "France", 1995, 2026],
  ["Monaco", "Ligue 1", "France", 1978, 2026],
  ["Saint-Étienne", "Ligue 1", "France", 1967, 1985],
  ["Celtic", "Scotland", "Scotland", 1965, 2026],
  ["Rangers", "Scotland", "Scotland", 1964, 2026],
  ["Anderlecht", "Belgium", "Belgium", 1970, 2026],
  ["Club Brugge", "Belgium", "Belgium", 1972, 2026],
  ["Steaua București", "Romania", "Romania", 1983, 2010],
  ["Red Star Belgrade", "Yugoslavia", "Serbia", 1968, 1992],
  ["Dynamo Kyiv", "Ukraine", "Ukraine", 1974, 2014],
  ["Spartak Moscow", "Russia", "Russia", 1970, 2012],
  ["CSKA Moscow", "Russia", "Russia", 1990, 2016],
  ["Galatasaray", "Turkey", "Turkey", 1985, 2026],
  ["Fenerbahçe", "Turkey", "Turkey", 1985, 2026],
  ["Beşiktaş", "Turkey", "Turkey", 1985, 2026],
  ["Olympiacos", "Greece", "Greece", 1975, 2026],
  ["Panathinaikos", "Greece", "Greece", 1970, 2020],
  ["Santos", "Brazil", "Brazil", 1958, 2015],
  ["Flamengo", "Brazil", "Brazil", 1980, 2026],
  ["São Paulo", "Brazil", "Brazil", 1990, 2026],
  ["Palmeiras", "Brazil", "Brazil", 1992, 2026],
  ["Corinthians", "Brazil", "Brazil", 1982, 2026],
  ["River Plate", "Argentina", "Argentina", 1975, 2026],
  ["Boca Juniors", "Argentina", "Argentina", 1976, 2026],
  ["Independiente", "Argentina", "Argentina", 1964, 1995],
  ["Nacional", "Uruguay", "Uruguay", 1970, 2000],
  ["Peñarol", "Uruguay", "Uruguay", 1960, 1990],
  ["América", "Mexico", "Mexico", 1980, 2026],
  ["Chivas", "Mexico", "Mexico", 1980, 2026],
  ["LA Galaxy", "MLS", "USA", 1996, 2026],
  ["Al-Hilal", "Saudi Pro League", "Saudi Arabia", 1990, 2026],
  ["Al-Nassr", "Saudi Pro League", "Saudi Arabia", 1994, 2026],
  ["Al Ahly", "Egypt", "Egypt", 1980, 2026],
  ["Zamalek", "Egypt", "Egypt", 1980, 2020],
  ["Kaizer Chiefs", "South Africa", "South Africa", 1985, 2020],
  ["Urawa Red Diamonds", "J-League", "Japan", 1993, 2026],
  ["Kashima Antlers", "J-League", "Japan", 1993, 2026],
  ["Jeonbuk Hyundai", "K League", "South Korea", 2000, 2026],
  ["Sydney FC", "A-League", "Australia", 2005, 2026],
];

const NATIONS = {
  Spain: {
    first: ["Carlos", "Sergio", "Iker", "David", "Javier", "Raúl", "Álvaro", "Fernando", "Pedro", "Diego", "Miguel", "Pablo", "Luis", "Andrés", "Xavi", "Iñigo", "Mikel", "Unai", "Aitor", "Isco"],
    last: ["García", "González", "Rodríguez", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Ruiz", "Díaz", "Álvarez", "Romero", "Torres", "Navarro", "Ramos", "Moreno", "Jiménez", "Alonso", "Castro"],
  },
  England: {
    first: ["James", "Jack", "Harry", "George", "Thomas", "Charlie", "Callum", "Jamie", "Ryan", "Steven", "Frank", "Wayne", "Ashley", "Scott", "Dean", "Lee", "Kevin", "Paul", "Michael", "Daniel"],
    last: ["Smith", "Jones", "Taylor", "Brown", "Wilson", "Johnson", "Williams", "Wright", "Walker", "Robinson", "Thompson", "White", "Harris", "Martin", "Jackson", "Clarke", "Hill", "Green", "Cooper", "Ward"],
  },
  Germany: {
    first: ["Thomas", "Michael", "Stefan", "Andreas", "Markus", "Christian", "Jürgen", "Klaus", "Franz", "Lothar", "Bastian", "Toni", "Manuel", "Mats", "Marco", "Mario", "Lukas", "Julian", "Kai", "Niclas"],
    last: ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Wagner", "Becker", "Hoffmann", "Schäfer", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Krüger", "Hartmann"],
  },
  Italy: {
    first: ["Marco", "Andrea", "Alessandro", "Giuseppe", "Francesco", "Luca", "Stefano", "Paolo", "Roberto", "Antonio", "Giovanni", "Fabio", "Claudio", "Massimo", "Daniele", "Simone", "Matteo", "Nicola", "Gianluca", "Emanuele"],
    last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci", "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Moretti"],
  },
  France: {
    first: ["Jean", "Pierre", "Michel", "Alain", "Philippe", "Nicolas", "Olivier", "Antoine", "Hugo", "Kylian", "Karim", "Thierry", "Zinedine", "Franck", "Patrice", "Blaise", "N'Golo", "Paul", "Raphaël", "Kingsley"],
    last: ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Lefebvre", "Michel", "Garcia", "David", "Bertrand", "Roux", "Vincent", "Fournier"],
  },
  Brazil: {
    first: ["José", "Carlos", "Paulo", "Lucas", "Gabriel", "Rafael", "Bruno", "Felipe", "Thiago", "Marcelo", "Rodrigo", "Eduardo", "André", "Marcos", "Diego", "Leonardo", "Fernando", "Ricardo", "Alexandre", "Gustavo"],
    last: ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa", "Ribeiro", "Martins", "Carvalho", "Almeida", "Nascimento", "Araújo", "Melo", "Barbosa", "Rocha"],
  },
  Argentina: {
    first: ["Juan", "Diego", "Carlos", "Javier", "Lionel", "Sergio", "Gonzalo", "Ángel", "Paulo", "Mauro", "Nicolás", "Leandro", "Franco", "Emiliano", "Rodrigo", "Julián", "Enzo", "Alexis", "Lautaro", "Marcos"],
    last: ["González", "Rodríguez", "Fernández", "García", "López", "Martínez", "Pérez", "Gómez", "Díaz", "Sánchez", "Romero", "Torres", "Flores", "Benítez", "Acosta", "Ruiz", "Castro", "Moreno", "Silva", "Rojas"],
  },
  Portugal: {
    first: ["João", "Pedro", "Rui", "Nuno", "Tiago", "André", "Ricardo", "Luís", "Bruno", "Cristiano", "Bernardo", "Rúben", "Diogo", "Gonçalo", "Rafael", "Sérgio", "Paulo", "Miguel", "Fábio", "Eder"],
    last: ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Jesus", "Sousa", "Fernandes", "Lopes", "Marques", "Almeida", "Alves", "Ribeiro", "Carvalho", "Pinto", "Teixeira", "Moreira"],
  },
  Netherlands: {
    first: ["Johan", "Marco", "Ruud", "Dennis", "Arjen", "Wesley", "Robin", "Edwin", "Frank", "Ronald", "Clarence", "Patrick", "Virgil", "Memphis", "Frenkie", "Matthijs", "Daley", "Georginio", "Steven", "Dirk"],
    last: ["de Jong", "de Boer", "van Dijk", "van Persie", "van Nistelrooy", "Koeman", "Bergkamp", "Robben", "Sneijder", "Gullit", "Rijkaard", "Seedorf", "Blind", "Depay", "Wijnaldum", "Promes", "Klaassen", "Hoedt", "Ake", "Timber"],
  },
  "United States": {
    first: ["Landon", "Clint", "Michael", "Christian", "Weston", "Tyler", "Jordan", "Giovanni", "Timothy", "DeAndre", "Brad", "Nick", "Chris", "Alex", "Matt", "Sam", "Jack", "Miles", "Brenden", "Ricardo"],
    last: ["Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez"],
  },
};

const NATION_KEYS = Object.keys(NATIONS);

function mulberry32(a) {
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(260907);

function pick(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickPosition() {
  const roll = rng() * 100;
  let acc = 0;
  for (const [pos, w] of POSITIONS) {
    acc += w;
    if (roll < acc) return pos;
  }
  return "CM";
}

function qualityFromRating(rating) {
  if (rating >= 90) return "perfect";
  if (rating >= 80) return "good";
  if (rating >= 70) return "med";
  if (rating >= 60) return "bad";
  return "really_bad";
}

function ratingFor(quality) {
  const [lo, hi] = RANGES[quality];
  return randInt(lo, hi);
}

function clubsForYear(year) {
  return CLUBS.filter((c) => year >= c[3] && year <= c[4]);
}

function makePlayer({ name, year, realTeam, league, nation, position, baseRating, quality }) {
  return {
    name: `${name} ${year}`.replace(/\s+/g, " ").trim(),
    year,
    realTeam,
    league,
    nation,
    position: position === "CF" ? "ST" : position,
    baseRating,
    quality,
  };
}

function extraStarSeasons() {
  /** Extra real peak/good seasons beyond all-time-legends.json */
  return [
    ["Lionel Messi", 2010, "Barcelona", "La Liga", "Argentina", "RW", 94, "perfect"],
    ["Lionel Messi", 2016, "Barcelona", "La Liga", "Argentina", "RW", 93, "perfect"],
    ["Lionel Messi", 2023, "Inter Miami", "MLS", "Argentina", "RW", 90, "perfect"],
    ["Cristiano Ronaldo", 2007, "Manchester United", "England", "Portugal", "RW", 91, "perfect"],
    ["Cristiano Ronaldo", 2009, "Manchester United", "England", "Portugal", "LW", 92, "perfect"],
    ["Cristiano Ronaldo", 2011, "Real Madrid", "La Liga", "Portugal", "LW", 92, "perfect"],
    ["Cristiano Ronaldo", 2015, "Real Madrid", "La Liga", "Portugal", "ST", 93, "perfect"],
    ["Cristiano Ronaldo", 2018, "Juventus", "Serie A", "Portugal", "ST", 92, "perfect"],
    ["Neymar", 2012, "Santos", "Brazil", "Brazil", "LW", 86, "good"],
    ["Neymar", 2017, "PSG", "Ligue 1", "Brazil", "LW", 90, "perfect"],
    ["Neymar", 2021, "PSG", "Ligue 1", "Brazil", "CAM", 89, "good"],
    ["Kylian Mbappé", 2017, "Monaco", "Ligue 1", "France", "ST", 86, "good"],
    ["Kylian Mbappé", 2021, "PSG", "Ligue 1", "France", "ST", 91, "perfect"],
    ["Erling Haaland", 2021, "Borussia Dortmund", "Bundesliga", "Norway", "ST", 88, "good"],
    ["Erling Haaland", 2022, "Manchester City", "England", "Norway", "ST", 90, "perfect"],
    ["Kevin De Bruyne", 2016, "Manchester City", "England", "Belgium", "CAM", 88, "good"],
    ["Kevin De Bruyne", 2018, "Manchester City", "England", "Belgium", "CAM", 90, "perfect"],
    ["Kevin De Bruyne", 2022, "Manchester City", "England", "Belgium", "CAM", 91, "perfect"],
    ["Luka Modrić", 2017, "Real Madrid", "La Liga", "Croatia", "CM", 89, "good"],
    ["Luka Modrić", 2022, "Real Madrid", "La Liga", "Croatia", "CM", 88, "good"],
    ["Toni Kroos", 2014, "Real Madrid", "La Liga", "Germany", "CM", 88, "good"],
    ["Toni Kroos", 2016, "Real Madrid", "La Liga", "Germany", "CM", 89, "good"],
    ["Sergio Ramos", 2010, "Real Madrid", "La Liga", "Spain", "CB", 87, "good"],
    ["Sergio Ramos", 2016, "Real Madrid", "La Liga", "Spain", "CB", 90, "perfect"],
    ["Virgil van Dijk", 2018, "Liverpool", "England", "Netherlands", "CB", 89, "good"],
    ["Virgil van Dijk", 2020, "Liverpool", "England", "Netherlands", "CB", 90, "perfect"],
    ["Mohamed Salah", 2017, "Liverpool", "England", "Egypt", "RW", 87, "good"],
    ["Mohamed Salah", 2019, "Liverpool", "England", "Egypt", "RW", 89, "good"],
    ["Mohamed Salah", 2022, "Liverpool", "England", "Egypt", "RW", 90, "perfect"],
    ["Sadio Mané", 2017, "Liverpool", "England", "Senegal", "LW", 86, "good"],
    ["Sadio Mané", 2022, "Bayern Munich", "Bundesliga", "Senegal", "ST", 87, "good"],
    ["Robert Lewandowski", 2013, "Borussia Dortmund", "Bundesliga", "Poland", "ST", 86, "good"],
    ["Robert Lewandowski", 2016, "Bayern Munich", "Bundesliga", "Poland", "ST", 90, "perfect"],
    ["Robert Lewandowski", 2022, "Barcelona", "La Liga", "Poland", "ST", 90, "perfect"],
    ["Karim Benzema", 2018, "Real Madrid", "La Liga", "France", "ST", 88, "good"],
    ["Karim Benzema", 2021, "Real Madrid", "La Liga", "France", "ST", 90, "perfect"],
    ["Luis Suárez", 2013, "Liverpool", "England", "Uruguay", "ST", 88, "good"],
    ["Luis Suárez", 2015, "Barcelona", "La Liga", "Uruguay", "ST", 90, "perfect"],
    ["Zlatan Ibrahimović", 2007, "Inter", "Serie A", "Sweden", "ST", 88, "good"],
    ["Zlatan Ibrahimović", 2011, "Milan", "Serie A", "Sweden", "ST", 89, "good"],
    ["Zlatan Ibrahimović", 2016, "Manchester United", "England", "Sweden", "ST", 88, "good"],
    ["Manuel Neuer", 2013, "Bayern Munich", "Bundesliga", "Germany", "GK", 90, "perfect"],
    ["Manuel Neuer", 2015, "Bayern Munich", "Bundesliga", "Germany", "GK", 91, "perfect"],
    ["Thibaut Courtois", 2014, "Atlético Madrid", "La Liga", "Belgium", "GK", 86, "good"],
    ["Thibaut Courtois", 2022, "Real Madrid", "La Liga", "Belgium", "GK", 90, "perfect"],
    ["Alisson", 2019, "Liverpool", "England", "Brazil", "GK", 89, "good"],
    ["Ederson", 2021, "Manchester City", "England", "Brazil", "GK", 88, "good"],
    ["Gianluigi Donnarumma", 2021, "PSG", "Ligue 1", "Italy", "GK", 88, "good"],
    ["Harry Kane", 2017, "Tottenham", "England", "England", "ST", 88, "good"],
    ["Harry Kane", 2021, "Tottenham", "England", "England", "ST", 89, "good"],
    ["Harry Kane", 2024, "Bayern Munich", "Bundesliga", "England", "ST", 90, "perfect"],
    ["Son Heung-min", 2020, "Tottenham", "England", "South Korea", "LW", 87, "good"],
    ["Son Heung-min", 2022, "Tottenham", "England", "South Korea", "LW", 89, "good"],
    ["Antoine Griezmann", 2016, "Atlético Madrid", "La Liga", "France", "ST", 88, "good"],
    ["Antoine Griezmann", 2018, "France", "World Cup", "France", "ST", 89, "good"],
    ["Eden Hazard", 2015, "Chelsea", "England", "Belgium", "LW", 90, "perfect"],
    ["Eden Hazard", 2017, "Chelsea", "England", "Belgium", "LW", 91, "perfect"],
    ["Eden Hazard", 2019, "Chelsea", "England", "Belgium", "CAM", 90, "perfect"],
    ["Gareth Bale", 2011, "Tottenham", "England", "Wales", "LW", 86, "good"],
    ["Gareth Bale", 2016, "Real Madrid", "La Liga", "Wales", "RW", 89, "good"],
    ["Luka Jović", 2019, "Eintracht Frankfurt", "Bundesliga", "Serbia", "ST", 82, "good"],
    ["Paulo Dybala", 2017, "Juventus", "Serie A", "Argentina", "CAM", 89, "good"],
    ["Paulo Dybala", 2020, "Juventus", "Serie A", "Argentina", "CF", 88, "good"],
    ["Romelu Lukaku", 2017, "Manchester United", "England", "Belgium", "ST", 86, "good"],
    ["Romelu Lukaku", 2021, "Inter", "Serie A", "Belgium", "ST", 88, "good"],
    ["Sergio Agüero", 2015, "Manchester City", "England", "Argentina", "ST", 89, "good"],
    ["Sergio Agüero", 2018, "Manchester City", "England", "Argentina", "ST", 89, "good"],
    ["David Silva", 2012, "Manchester City", "England", "Spain", "CAM", 88, "good"],
    ["David Silva", 2017, "Manchester City", "England", "Spain", "CAM", 88, "good"],
    ["Andrés Iniesta", 2009, "Barcelona", "La Liga", "Spain", "CM", 90, "perfect"],
    ["Xavi Hernández", 2009, "Barcelona", "La Liga", "Spain", "CM", 91, "perfect"],
    ["Xavi Hernández", 2012, "Barcelona", "La Liga", "Spain", "CM", 90, "perfect"],
    ["Sergio Busquets", 2015, "Barcelona", "La Liga", "Spain", "CDM", 87, "good"],
    ["Jordi Alba", 2015, "Barcelona", "La Liga", "Spain", "LB", 86, "good"],
    ["Dani Alves", 2015, "Barcelona", "La Liga", "Spain", "RB", 86, "good"],
    ["Gerard Piqué", 2015, "Barcelona", "La Liga", "Spain", "CB", 87, "good"],
    ["Thiago Silva", 2014, "PSG", "Ligue 1", "Brazil", "CB", 88, "good"],
    ["Thiago Silva", 2021, "Chelsea", "England", "Brazil", "CB", 86, "good"],
    ["Kalidou Koulibaly", 2018, "Napoli", "Serie A", "Senegal", "CB", 87, "good"],
    ["Raphaël Varane", 2018, "Real Madrid", "La Liga", "France", "CB", 86, "good"],
    ["Aymeric Laporte", 2019, "Manchester City", "England", "Spain", "CB", 86, "good"],
    ["Andrew Robertson", 2019, "Liverpool", "England", "Scotland", "LB", 86, "good"],
    ["Trent Alexander-Arnold", 2019, "Liverpool", "England", "England", "RB", 87, "good"],
    ["Joshua Kimmich", 2020, "Bayern Munich", "Bundesliga", "Germany", "CDM", 88, "good"],
    ["Thomas Müller", 2013, "Bayern Munich", "Bundesliga", "Germany", "CAM", 86, "good"],
    ["Thomas Müller", 2020, "Bayern Munich", "Bundesliga", "Germany", "CAM", 87, "good"],
    ["Robert Pires", 2002, "Arsenal", "England", "France", "LW", 87, "good"],
    ["Thierry Henry", 2002, "Arsenal", "England", "France", "ST", 91, "perfect"],
    ["Patrick Vieira", 1998, "Arsenal", "England", "France", "CDM", 88, "good"],
    ["Dennis Bergkamp", 2004, "Arsenal", "England", "Netherlands", "CF", 87, "good"],
    ["Cesc Fàbregas", 2008, "Arsenal", "England", "Spain", "CM", 86, "good"],
    ["Cesc Fàbregas", 2015, "Chelsea", "England", "Spain", "CM", 86, "good"],
    ["Frank Lampard", 2010, "Chelsea", "England", "England", "CM", 88, "good"],
    ["John Terry", 2005, "Chelsea", "England", "England", "CB", 88, "good"],
    ["John Terry", 2010, "Chelsea", "England", "England", "CB", 87, "good"],
    ["Didier Drogba", 2006, "Chelsea", "England", "Ivory Coast", "ST", 88, "good"],
    ["Michael Essien", 2007, "Chelsea", "England", "Ghana", "CDM", 86, "good"],
    ["Steven Gerrard", 2009, "Liverpool", "England", "England", "CM", 89, "good"],
    ["Fernando Torres", 2009, "Liverpool", "England", "Spain", "ST", 88, "good"],
    ["Luis García", 2005, "Liverpool", "England", "Spain", "CAM", 82, "good"],
    ["Xabi Alonso", 2005, "Liverpool", "England", "Spain", "CDM", 85, "good"],
    ["Jamie Carragher", 2008, "Liverpool", "England", "England", "CB", 83, "good"],
    ["Wayne Rooney", 2006, "Manchester United", "England", "England", "ST", 87, "good"],
    ["Wayne Rooney", 2013, "Manchester United", "England", "England", "CAM", 88, "good"],
    ["Ryan Giggs", 1999, "Manchester United", "England", "Wales", "LM", 88, "good"],
    ["Ryan Giggs", 2008, "Manchester United", "England", "Wales", "LM", 86, "good"],
    ["Paul Scholes", 2003, "Manchester United", "England", "England", "CM", 88, "good"],
    ["Rio Ferdinand", 2004, "Manchester United", "England", "England", "CB", 87, "good"],
    ["Nemanja Vidić", 2009, "Manchester United", "England", "Serbia", "CB", 88, "good"],
    ["Patrice Evra", 2009, "Manchester United", "England", "France", "LB", 85, "good"],
    ["Cristiano Ronaldo", 2004, "Manchester United", "England", "Portugal", "RW", 80, "good"],
    ["Ruud van Nistelrooy", 2003, "Manchester United", "England", "Netherlands", "ST", 88, "good"],
    ["Ole Gunnar Solskjær", 1999, "Manchester United", "England", "Norway", "ST", 82, "good"],
    ["David Beckham", 2003, "Real Madrid", "La Liga", "England", "RM", 87, "good"],
    ["Zinedine Zidane", 2001, "Juventus", "Serie A", "France", "CAM", 93, "perfect"],
    ["Alessandro Del Piero", 2003, "Juventus", "Serie A", "Italy", "CF", 88, "good"],
    ["Pavel Nedvěd", 2003, "Juventus", "Serie A", "Czech Republic", "LM", 89, "good"],
    ["Gianluigi Buffon", 2003, "Juventus", "Serie A", "Italy", "GK", 90, "perfect"],
    ["Andrea Pirlo", 2009, "Milan", "Serie A", "Italy", "CM", 89, "good"],
    ["Kaká", 2005, "Milan", "Serie A", "Brazil", "CAM", 90, "perfect"],
    ["Andriy Shevchenko", 2006, "Chelsea", "England", "Ukraine", "ST", 86, "good"],
    ["Paolo Maldini", 1999, "Milan", "Serie A", "Italy", "LB", 91, "perfect"],
    ["Franco Baresi", 1992, "Milan", "Serie A", "Italy", "CB", 91, "perfect"],
    ["Marco van Basten", 1988, "Milan", "Serie A", "Netherlands", "ST", 93, "perfect"],
    ["Ruud Gullit", 1987, "Milan", "Serie A", "Netherlands", "CAM", 91, "perfect"],
    ["Frank Rijkaard", 1990, "Milan", "Serie A", "Netherlands", "CDM", 89, "good"],
    ["Ronaldo Nazário", 1998, "Inter", "Serie A", "Brazil", "ST", 94, "perfect"],
    ["Ronaldo Nazário", 2003, "Real Madrid", "La Liga", "Brazil", "ST", 91, "perfect"],
    ["Adriano", 2005, "Inter", "Serie A", "Brazil", "ST", 87, "good"],
    ["Javier Zanetti", 2005, "Inter", "Serie A", "Argentina", "RB", 86, "good"],
    ["Diego Milito", 2010, "Inter", "Serie A", "Argentina", "ST", 86, "good"],
    ["Wesley Sneijder", 2011, "Inter", "Serie A", "Netherlands", "CAM", 86, "good"],
    ["Francesco Totti", 2003, "Roma", "Serie A", "Italy", "CAM", 89, "good"],
    ["Daniele De Rossi", 2010, "Roma", "Serie A", "Italy", "CDM", 85, "good"],
    ["Gianluca Zambrotta", 2006, "Juventus", "Serie A", "Italy", "RB", 85, "good"],
    ["Fabio Cannavaro", 2003, "Inter", "Serie A", "Italy", "CB", 87, "good"],
    ["Alessandro Nesta", 2007, "Milan", "Serie A", "Italy", "CB", 89, "good"],
    ["Gennaro Gattuso", 2007, "Milan", "Serie A", "Italy", "CDM", 85, "good"],
    ["Clarence Seedorf", 2005, "Milan", "Serie A", "Netherlands", "CM", 87, "good"],
    ["Ronaldinho", 2004, "Barcelona", "La Liga", "Brazil", "CAM", 92, "perfect"],
    ["Samuel Eto'o", 2005, "Barcelona", "La Liga", "Cameroon", "ST", 89, "good"],
    ["Deco", 2004, "Porto", "Portugal", "Portugal", "CAM", 86, "good"],
    ["Deco", 2006, "Barcelona", "La Liga", "Portugal", "CAM", 87, "good"],
    ["Ricardo Carvalho", 2004, "Porto", "Portugal", "Portugal", "CB", 85, "good"],
    ["Ricardo Carvalho", 2008, "Chelsea", "England", "Portugal", "CB", 86, "good"],
    ["Luís Figo", 1998, "Barcelona", "La Liga", "Portugal", "RW", 89, "good"],
    ["Raúl González", 1998, "Real Madrid", "La Liga", "Spain", "ST", 88, "good"],
    ["Raúl González", 2003, "Real Madrid", "La Liga", "Spain", "ST", 88, "good"],
    ["Iker Casillas", 2002, "Real Madrid", "La Liga", "Spain", "GK", 88, "good"],
    ["Roberto Carlos", 1998, "Real Madrid", "La Liga", "Brazil", "LB", 89, "good"],
    ["Roberto Carlos", 2005, "Real Madrid", "La Liga", "Brazil", "LB", 87, "good"],
    ["Zinedine Zidane", 2003, "Real Madrid", "La Liga", "France", "CAM", 92, "perfect"],
    ["Luís Figo", 2003, "Real Madrid", "La Liga", "Portugal", "RW", 88, "good"],
    ["Ronaldo Nazário", 2005, "Real Madrid", "La Liga", "Brazil", "ST", 87, "good"],
    ["Thierry Henry", 2008, "Barcelona", "La Liga", "France", "ST", 88, "good"],
    ["Didier Drogba", 2007, "Chelsea", "England", "Ivory Coast", "ST", 87, "good"],
    ["Arjen Robben", 2010, "Bayern Munich", "Bundesliga", "Netherlands", "RW", 88, "good"],
    ["Franck Ribéry", 2010, "Bayern Munich", "Bundesliga", "France", "LW", 88, "good"],
    ["Philipp Lahm", 2008, "Bayern Munich", "Bundesliga", "Germany", "RB", 87, "good"],
    ["Bastian Schweinsteiger", 2010, "Bayern Munich", "Bundesliga", "Germany", "CM", 87, "good"],
    ["Bastian Schweinsteiger", 2014, "Germany", "World Cup", "Germany", "CM", 88, "good"],
    ["Miroslav Klose", 2006, "Werder Bremen", "Bundesliga", "Germany", "ST", 86, "good"],
    ["Miroslav Klose", 2014, "Germany", "World Cup", "Germany", "ST", 84, "good"],
    ["Lukas Podolski", 2006, "Germany", "World Cup", "Germany", "LW", 83, "good"],
    ["Mesut Özil", 2010, "Real Madrid", "La Liga", "Germany", "CAM", 86, "good"],
    ["Mesut Özil", 2013, "Arsenal", "England", "Germany", "CAM", 87, "good"],
    ["Toni Kroos", 2010, "Bayern Munich", "Bundesliga", "Germany", "CM", 83, "good"],
    ["Manuel Neuer", 2011, "Bayern Munich", "Bundesliga", "Germany", "GK", 86, "good"],
    ["Robert Lewandowski", 2012, "Borussia Dortmund", "Bundesliga", "Poland", "ST", 84, "good"],
    ["Marco Reus", 2013, "Borussia Dortmund", "Bundesliga", "Germany", "CAM", 86, "good"],
    ["Marco Reus", 2019, "Borussia Dortmund", "Bundesliga", "Germany", "CAM", 86, "good"],
    ["Pierre-Emerick Aubameyang", 2017, "Borussia Dortmund", "Bundesliga", "Gabon", "ST", 87, "good"],
    ["Pierre-Emerick Aubameyang", 2019, "Arsenal", "England", "Gabon", "ST", 87, "good"],
    ["Jadon Sancho", 2020, "Borussia Dortmund", "Bundesliga", "England", "RW", 85, "good"],
    ["Jude Bellingham", 2024, "Real Madrid", "La Liga", "England", "CM", 90, "perfect"],
    ["Vinícius Júnior", 2022, "Real Madrid", "La Liga", "Brazil", "LW", 86, "good"],
    ["Vinícius Júnior", 2024, "Real Madrid", "La Liga", "Brazil", "LW", 90, "perfect"],
    ["Rodri", 2023, "Manchester City", "England", "Spain", "CDM", 91, "perfect"],
    ["Pedri", 2021, "Barcelona", "La Liga", "Spain", "CM", 85, "good"],
    ["Gavi", 2022, "Barcelona", "La Liga", "Spain", "CM", 83, "good"],
    ["Jamal Musiala", 2023, "Bayern Munich", "Bundesliga", "Germany", "CAM", 86, "good"],
    ["Florian Wirtz", 2024, "Bayer Leverkusen", "Bundesliga", "Germany", "CAM", 88, "good"],
    ["Bukayo Saka", 2023, "Arsenal", "England", "England", "RW", 86, "good"],
    ["Phil Foden", 2023, "Manchester City", "England", "England", "CAM", 85, "good"],
    ["Cole Palmer", 2024, "Chelsea", "England", "England", "CAM", 85, "good"],
    ["Lautaro Martínez", 2024, "Inter", "Serie A", "Argentina", "ST", 89, "good"],
    ["Kylian Mbappé", 2024, "Real Madrid", "La Liga", "France", "ST", 91, "perfect"],
    ["Lamine Yamal", 2024, "Barcelona", "La Liga", "Spain", "RW", 85, "good"],
    ["Pelé", 1958, "Brazil", "World Cup", "Brazil", "ST", 94, "perfect"],
    ["Pelé", 1966, "Santos", "Brazil", "Brazil", "ST", 93, "perfect"],
    ["Diego Maradona", 1981, "Boca Juniors", "Argentina", "Argentina", "CAM", 90, "perfect"],
    ["Diego Maradona", 1984, "Barcelona", "La Liga", "Argentina", "CAM", 91, "perfect"],
    ["Johan Cruyff", 1971, "Ajax", "Eredivisie", "Netherlands", "CAM", 93, "perfect"],
    ["Franz Beckenbauer", 1970, "Bayern Munich", "Bundesliga", "Germany", "CB", 91, "perfect"],
    ["Gerd Müller", 1970, "Bayern Munich", "Bundesliga", "Germany", "ST", 92, "perfect"],
    ["Eusébio", 1962, "Benfica", "Portugal", "Portugal", "ST", 91, "perfect"],
    ["George Best", 1965, "Manchester United", "England", "Northern Ireland", "RW", 90, "perfect"],
    ["Bobby Charlton", 1968, "Manchester United", "England", "England", "CAM", 91, "perfect"],
    ["Lev Yashin", 1956, "Dynamo Moscow", "Soviet Union", "Russia", "GK", 92, "perfect"],
    ["Garrincha", 1958, "Botafogo", "Brazil", "Brazil", "RW", 91, "perfect"],
    ["Ferenc Puskás", 1954, "Hungary", "World Cup", "Hungary", "ST", 93, "perfect"],
    ["Alfredo Di Stéfano", 1956, "Real Madrid", "La Liga", "Argentina", "ST", 94, "perfect"],
    ["Zico", 1982, "Flamengo", "Brazil", "Brazil", "CAM", 92, "perfect"],
    ["Michel Platini", 1983, "Juventus", "Serie A", "France", "CAM", 93, "perfect"],
    ["Marco van Basten", 1986, "Ajax", "Eredivisie", "Netherlands", "ST", 90, "perfect"],
    ["Ruud Gullit", 1987, "PSV", "Eredivisie", "Netherlands", "CAM", 88, "good"],
    ["Hristo Stoichkov", 1992, "Barcelona", "La Liga", "Bulgaria", "ST", 89, "good"],
    ["Gheorghe Hagi", 1996, "Galatasaray", "Turkey", "Romania", "CAM", 87, "good"],
    ["George Weah", 1993, "PSG", "Ligue 1", "Liberia", "ST", 89, "good"],
    ["Romário", 1993, "Barcelona", "La Liga", "Brazil", "ST", 91, "perfect"],
    ["Rivaldo", 2002, "Brazil", "World Cup", "Brazil", "CAM", 90, "perfect"],
    ["Ronaldinho", 2002, "PSG", "Ligue 1", "Brazil", "CAM", 86, "good"],
    ["Ronaldo Nazário", 1993, "Cruzeiro", "Brazil", "Brazil", "ST", 84, "good"],
    ["Kaká", 2003, "Milan", "Serie A", "Brazil", "CAM", 86, "good"],
    ["Kaká", 2009, "Real Madrid", "La Liga", "Brazil", "CAM", 87, "good"],
    ["Wayne Rooney", 2004, "Manchester United", "England", "England", "ST", 84, "good"],
    ["Cristiano Ronaldo", 2019, "Juventus", "Serie A", "Portugal", "ST", 91, "perfect"],
    ["Lionel Messi", 2021, "PSG", "Ligue 1", "Argentina", "RW", 92, "perfect"],
    ["Karim Benzema", 2014, "Real Madrid", "La Liga", "France", "ST", 86, "good"],
    ["Iker Casillas", 2012, "Real Madrid", "La Liga", "Spain", "GK", 88, "good"],
    ["Gianluigi Buffon", 2012, "Juventus", "Serie A", "Italy", "GK", 88, "good"],
    ["Petr Čech", 2010, "Chelsea", "England", "Czech Republic", "GK", 88, "good"],
    ["Edwin van der Sar", 2003, "Fulham", "England", "Netherlands", "GK", 85, "good"],
    ["Oliver Kahn", 2001, "Bayern Munich", "Bundesliga", "Germany", "GK", 90, "perfect"],
    ["Dino Zoff", 1978, "Italy", "World Cup", "Italy", "GK", 88, "good"],
    ["Gordon Banks", 1970, "England", "World Cup", "England", "GK", 90, "perfect"],
    ["Peter Schmeichel", 1994, "Manchester United", "England", "Denmark", "GK", 88, "good"],
  ];
}

function loadLegends() {
  const file = path.join(DATA, "all-time-legends.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return (raw.players ?? []).map((p) => ({
    name: p.name,
    year: p.year,
    realTeam: p.realTeam,
    league: p.league || "All-time",
    nation: p.nation || "",
    position: p.position === "CF" ? "ST" : p.position,
    baseRating: p.baseRating,
    quality: qualityFromRating(p.baseRating),
  }));
}

function fillGenerated(existing, quality, need) {
  const out = [];
  const used = new Set(existing.map((p) => p.name.toLowerCase()));
  const usedPeople = new Set(
    existing.map((p) => p.name.replace(/\s+(19|20)\d{2}$/, "").toLowerCase())
  );
  let guard = 0;
  while (out.length < need && guard < need * 40) {
    guard += 1;
    const nation = pick(NATION_KEYS);
    const bank = NATIONS[nation];
    const first = pick(bank.first);
    const last = pick(bank.last);
    const person = `${first} ${last}`;
    if (usedPeople.has(person.toLowerCase()) && rng() < 0.92) continue;
    const [yearLo, yearHi] = YEAR_RANGES[quality] ?? [1958, 2026];
    const year = randInt(yearLo, yearHi);
    const clubs = clubsForYear(year);
    if (clubs.length === 0) continue;
    const club = pick(clubs);
    const name = `${person} ${year}`;
    if (used.has(name.toLowerCase())) continue;
    used.add(name.toLowerCase());
    usedPeople.add(person.toLowerCase());
    out.push(
      makePlayer({
        name: person,
        year,
        realTeam: club[0],
        league: club[1],
        nation: club[2],
        position: pickPosition(),
        baseRating: ratingFor(quality),
        quality,
      })
    );
  }
  return out;
}

function main() {
  const players = [];
  const used = new Set();

  function add(p) {
    const key = p.name.toLowerCase();
    if (used.has(key)) return false;
    used.add(key);
    players.push(p);
    return true;
  }

  for (const p of loadLegends()) add(p);

  for (const row of extraStarSeasons()) {
    const [name, year, realTeam, league, nation, position, baseRating, quality] = row;
    add(
      makePlayer({ name, year, realTeam, league, nation, position, baseRating, quality })
    );
  }

  const counts = { perfect: 0, good: 0, med: 0, bad: 0, really_bad: 0 };
  for (const p of players) counts[p.quality] += 1;

  for (const quality of ["perfect", "good", "med", "bad", "really_bad"]) {
    const need = Math.max(0, QUOTAS[quality] - counts[quality]);
    if (need === 0) continue;
    const extra = fillGenerated(players, quality, need);
    for (const p of extra) add(p);
  }

  // Trim or top-up to exact TARGET while keeping quota shape as close as possible
  if (players.length > TARGET) {
    const dropable = players.filter((p) => p.quality === "med" || p.quality === "bad");
    dropable.sort((a, b) => a.name.localeCompare(b.name));
    const remove = players.length - TARGET;
    const dropSet = new Set(dropable.slice(0, remove).map((p) => p.name));
    const kept = players.filter((p) => !dropSet.has(p.name));
    players.length = 0;
    players.push(...kept);
  }
  while (players.length < TARGET) {
    const extra = fillGenerated(players, "med", TARGET - players.length);
    for (const p of extra) {
      if (players.length >= TARGET) break;
      add(p);
    }
    if (extra.length === 0) break;
  }

  const quality = { perfect: 0, good: 0, med: 0, bad: 0, really_bad: 0 };
  for (const p of players) quality[p.quality] += 1;

  const out = {
    source: "All-time career years (not FIFA cards) — quality pyramid",
    count: players.length,
    quality,
    generatedAt: new Date().toISOString(),
    players,
  };

  const dest = path.join(DATA, "all-time-players.json");
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`Wrote ${players.length} players → ${dest}`);
  console.log(quality);
}

main();
