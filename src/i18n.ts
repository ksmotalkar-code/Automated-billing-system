import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "Dashboard": "Dashboard",
      "Customers": "Customers",
      "Alerts & Notifications": "Alerts & Notifications",
      "Invoices & Billing": "Invoices & Billing",
      "Payments": "Payments",
      "Data Upload": "Data Upload",
      "Settings": "Settings",
      "Overview & Metrics": "Overview & Metrics",
      "Manage Accounts": "Manage Accounts",
      "Monitor & Remind": "Monitor & Remind",
      "Billing Cycles": "Billing Cycles",
      "Transaction History": "Transaction History",
      "Upload Excel/PDF": "Upload Excel/PDF",
      "SmartBilling": "SmartBilling",
      "Water Management": "Water Management",
      "Total Revenue": "Total Revenue",
      "Active Customers": "Active Customers",
      "Pending Payments": "Pending Payments",
      "System Status": "System Status",
      "Add Customer": "Add Customer",
      "Search": "Search",
      "Name": "Name",
      "Mobile Number": "Mobile Number",
      "Status": "Status",
      "Balance": "Balance",
      "Action": "Action",
      "Run Billing Cycle": "Run Billing Cycle",
      "Apply Penalties": "Apply Penalties",
      "Receive Payment": "Receive Payment",
      "Confirm Payment": "Confirm Payment",
      "Upload Data": "Upload Data",
      "Select File": "Select File",
      "Process Data": "Process Data",
      "Language": "Language",
      "English": "English",
      "Punjabi": "ਪੰਜਾਬੀ"
    }
  },
  pa: {
    translation: {
      "Dashboard": "ਡੈਸ਼ਬੋਰਡ",
      "Customers": "ਗਾਹਕ",
      "Alerts & Notifications": "ਚੇਤਾਵਨੀਆਂ ਅਤੇ ਸੂਚਨਾਵਾਂ",
      "Invoices & Billing": "ਚਲਾਨ ਅਤੇ ਬਿਲਿੰਗ",
      "Payments": "ਭੁਗਤਾਨ",
      "Data Upload": "ਡਾਟਾ ਅੱਪਲੋਡ",
      "Settings": "ਸੈਟਿੰਗਾਂ",
      "Overview & Metrics": "ਸੰਖੇਪ ਜਾਣਕਾਰੀ ਅਤੇ ਮੈਟ੍ਰਿਕਸ",
      "Manage Accounts": "ਖਾਤਿਆਂ ਦਾ ਪ੍ਰਬੰਧਨ ਕਰੋ",
      "Monitor & Remind": "ਨਿਗਰਾਨੀ ਅਤੇ ਯਾਦ ਦਿਵਾਓ",
      "Billing Cycles": "ਬਿਲਿੰਗ ਚੱਕਰ",
      "Transaction History": "ਲੈਣ-ਦੇਣ ਦਾ ਇਤਿਹਾਸ",
      "Upload Excel/PDF": "ਐਕਸਲ/ਪੀਡੀਐਫ ਅੱਪਲੋਡ ਕਰੋ",
      "SmartBilling": "ਸਮਾਰਟ ਬਿਲਿੰਗ",
      "Water Management": "ਜਲ ਪ੍ਰਬੰਧਨ",
      "Total Revenue": "ਕੁੱਲ ਆਮਦਨ",
      "Active Customers": "ਸਰਗਰਮ ਗਾਹਕ",
      "Pending Payments": "ਬਕਾਇਆ ਭੁਗਤਾਨ",
      "System Status": "ਸਿਸਟਮ ਸਥਿਤੀ",
      "Add Customer": "ਗਾਹਕ ਸ਼ਾਮਲ ਕਰੋ",
      "Search": "ਖੋਜ",
      "Name": "ਨਾਮ",
      "Mobile Number": "ਮੋਬਾਈਲ ਨੰਬਰ",
      "Status": "ਸਥਿਤੀ",
      "Balance": "ਬਕਾਇਆ",
      "Action": "ਕਾਰਵਾਈ",
      "Run Billing Cycle": "ਬਿਲਿੰਗ ਚੱਕਰ ਚਲਾਓ",
      "Apply Penalties": "ਜੁਰਮਾਨੇ ਲਾਗੂ ਕਰੋ",
      "Receive Payment": "ਭੁਗਤਾਨ ਪ੍ਰਾਪਤ ਕਰੋ",
      "Confirm Payment": "ਭੁਗਤਾਨ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ",
      "Upload Data": "ਡਾਟਾ ਅੱਪਲੋਡ ਕਰੋ",
      "Select File": "ਫਾਈਲ ਚੁਣੋ",
      "Process Data": "ਡਾਟਾ ਪ੍ਰੋਸੈਸ ਕਰੋ",
      "Language": "ਭਾਸ਼ਾ",
      "English": "English",
      "Punjabi": "ਪੰਜਾਬੀ"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en", 
    fallbackLng: "en",
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;
