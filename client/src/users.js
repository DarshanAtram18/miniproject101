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
