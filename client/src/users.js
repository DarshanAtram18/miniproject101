import { facultyList } from './constants';

const generateUsername = (name) => {
  // Extract parts: "Dr. A. R. Surve" -> ["A", "R", "Surve"]
  // Remove Titles
  const cleanName = name.replace(/Dr\.|Mr\.|Ms\.|Mrs\./g, "").trim();
  const parts = cleanName.split(" ").filter(p => p.length > 0);
  
  if (parts.length < 2) return cleanName.toLowerCase();
  
  const surname = parts[parts.length - 1].toLowerCase();
  const initials = parts.slice(0, parts.length - 1).map(p => p[0].toLowerCase()).join("");
  
  return `${initials}${surname}`; // e.g., appawar
};

const generatePassword = (name) => {
  const parts = name.split(" ");
  const surname = parts[parts.length - 1].toLowerCase();
  return `${surname}@2026`;
};

const accounts = facultyList.map(f => ({
  ...f,
  username: generateUsername(f.name),
  password: generatePassword(f.name),
  role: f.role === "HOD" ? "HOD" : "Faculty"
}));

// Add Admin Account
accounts.push({
  name: "System Administrator",
  username: "admin",
  password: "admin@2026",
  role: "Admin",
  dept: "All Departments"
});

// Add Club Accounts (Password: 123 for all clubs)
const clubList = [
  { name: "ACM Student Chapter", username: "acm@wce", dept: "Computer Science and Engineering" },
  { name: "ACSES (Association of Computer Science & Engg Students)", username: "acses@wce", dept: "Computer Science and Engineering" },
  { name: "Walchand Linux Users Group (WLUG)", username: "wlug@wce", dept: "Computer Science and Engineering" },
  { name: "SAIT (Students Association of Information Technology)", username: "sait@wce", dept: "Information Technology" },
  { name: "CESA (Civil Engineering Students Association)", username: "cesa@wce", dept: "Civil Engineering" },
  { name: "ELESA (Electronics Engineering Students Association)", username: "elesa@wce", dept: "Electronics Engineering" },
  { name: "Microsoft Learn Student Chapter (MLSC WCE)", username: "mlsc@wce", dept: "Computer Science and Engineering" },
  { name: "Rotaract Club of WCE Sangli", username: "rotaract@wce", dept: "Institutional / Student Activities" },
  { name: "Google Developer Groups on Campus (GDG WCE)", username: "gdg@wce", dept: "Computer Science and Engineering" }
];

clubList.forEach(c => {
  accounts.push({
    name: c.name,
    username: c.username,
    password: "123",
    role: "Club",
    dept: c.dept
  });
});

export const users = accounts;

export const authenticate = (inputUsername, inputPassword) => {
  const customPasswords = JSON.parse(localStorage.getItem('wce_prof_insights_passwords')) || {};
  
  // Very forgiving username matching
  // Strip out titles like Dr., Mr., Ms. and any spaces
  const cleanInput = inputUsername.toLowerCase()
    .replace(/dr\.?|mr\.?|ms\.?|mrs\.?/g, "")
    .replace(/\s+/g, "")
    .trim();
  
  // Also strip dots for a pure character comparison: 'appawar'
  const inputNoDots = cleanInput.replace(/\./g, "");

  return users.find(u => {
    // Determine effective password
    const effectivePassword = customPasswords[u.username] || u.password;

    // Reject immediately if passwords don't match
    if (effectivePassword !== inputPassword) return false;
    
    // Ignore dots in the generated username as well: 'a.p.pawar' -> 'appawar'
    const userNoDots = u.username.replace(/\./g, "");
    
    return userNoDots === inputNoDots || u.username === inputUsername.toLowerCase() || u.username === inputUsername;
  });
};

export const changeUserPassword = (username, newPassword) => {
  const customPasswords = JSON.parse(localStorage.getItem('wce_prof_insights_passwords')) || {};
  customPasswords[username] = newPassword;
  localStorage.setItem('wce_prof_insights_passwords', JSON.stringify(customPasswords));
};
