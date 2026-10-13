import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { setFormatDefaults } from './format.js'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
]

export const resources = {
  en: {
    translation: {
      nav: {
        dashboard: 'Dashboard',
        hr: 'Human Resources',
        employees: 'Employees',
        payroll: 'Payroll',
        timeAttendance: 'Time & Attendance',
        recruitment: 'Recruitment',
        finance: 'Finance',
        accountsPayable: 'Accounts Payable',
        accountsReceivable: 'Accounts Receivable',
        expenses: 'Expenses',
        trialBalance: 'Trial Balance',
        crm: 'CRM',
        deals: 'Deals Pipeline',
        salesPerformance: 'Sales Performance',
        revenueForecast: 'Revenue Forecast',
        inventory: 'Inventory',
        productCatalog: 'Product Catalog',
        stockMovements: 'Stock Movements',
        projects: 'Projects',
        portfolio: 'Portfolio Overview',
        activeSprints: 'Active Sprints',
        roadmap: 'Roadmap',
        settings: 'Settings',
        general: 'General Settings',
        members: 'Members & Roles',
        billing: 'Billing & Plans',
        integrations: 'Integrations',
        notifications: 'Notifications',
        dataExport: 'Data Export',
        support: 'Support / Help',
      },
      common: {
        newEntry: 'New Entry',
        search: 'Search...',
        searchJump: 'Search or jump to...',
        logout: 'Log Out',
        toggleTheme: 'Toggle Theme',
        downloadApp: 'Download Desktop App',
        profilePreferences: 'Profile & Preferences',
        createWorkspace: 'Create New Workspace',
        sampleData: 'Sample',
        save: 'Save',
        saveChanges: 'Save Changes',
        cancel: 'Cancel',
        confirm: 'Confirm',
        delete: 'Delete',
        edit: 'Edit',
        create: 'Create',
        add: 'Add',
        filter: 'Filter',
        export: 'Export',
        download: 'Download',
        close: 'Close',
        loading: 'Loading...',
        back: 'Back',
        next: 'Next',
        previous: 'Previous',
        submit: 'Submit',
        status: 'Status',
        name: 'Name',
        date: 'Date',
        amount: 'Amount',
        actions: 'Actions',
        total: 'Total',
        all: 'All',
        language: 'Language',
        arabic: 'العربية',
        english: 'English',
        switchLanguage: 'Switch Language',
        active: 'Active',
        completed: 'Completed',
        pending: 'Pending',
        draft: 'Draft',
        approved: 'Approved',
        paid: 'Paid',
        void: 'Void',
        reimbursed: 'Reimbursed',
        rejected: 'Rejected',
        online: 'Online',
        offline: 'Offline',
        yes: 'Yes',
        no: 'No',
        error: 'Error',
        success: 'Success',
      },
      auth: {
        login: 'Sign In',
        register: 'Create Account',
        email: 'Email Address',
        password: 'Password',
        terms: 'Terms of Service',
        privacy: 'Privacy Policy',
      },
      dashboard: {
        overview: 'Dashboard Overview',
        cashFlow: 'Cash Flow',
        recentActivity: 'Recent Activity',
        headcount: 'Headcount',
        activeSprints: 'Active Sprints',
        exceptions: 'Exceptions',
        openPipeline: 'Open Pipeline',
      },
    },
  },
  ar: {
    translation: {
      nav: {
        dashboard: 'لوحة التحكم',
        hr: 'الموارد البشرية',
        employees: 'دليل الموظفين',
        payroll: 'مسيرات الرواتب',
        timeAttendance: 'الدوام والحضور',
        recruitment: 'التوظيف والترشيح',
        finance: 'الإدارة المالية',
        accountsPayable: 'حسابات الموردين (AP)',
        accountsReceivable: 'حسابات العملاء (AR)',
        expenses: 'المصروفات والنفقات',
        trialBalance: 'ميزان المراجعة',
        crm: 'إدارة العملاء (CRM)',
        deals: 'مسار الصفقات',
        salesPerformance: 'أداء المبيعات',
        revenueForecast: 'توقعات الإيرادات',
        inventory: 'المخزون والمستودعات',
        productCatalog: 'دليل المنتجات',
        stockMovements: 'حركات المخزون',
        projects: 'إدارة المشاريع',
        portfolio: 'نظرة عامة على المحفظة',
        activeSprints: 'الدورات الحالية (Sprints)',
        roadmap: 'خريطة الطريق',
        settings: 'الإعدادات',
        general: 'الإعدادات العامة',
        members: 'الأعضاء والأدوار',
        billing: 'الاشتراكات والفواتير',
        integrations: 'التكاملات والربط',
        notifications: 'إشعارات النظام',
        dataExport: 'تصدير البيانات',
        support: 'مركز المساعدة والدعم',
      },
      common: {
        newEntry: 'إدخال جديد',
        search: 'بحث...',
        searchJump: 'بحث أو انتقال سريع...',
        logout: 'تسجيل الخروج',
        toggleTheme: 'تبديل المظهر',
        downloadApp: 'تنزيل تطبيق سطح المكتب',
        profilePreferences: 'الملف الشخصي والتفضيلات',
        createWorkspace: 'إنشاء مساحة عمل جديدة',
        sampleData: 'بيانات تجريبية',
        save: 'حفظ',
        saveChanges: 'حفظ التغييرات',
        cancel: 'إلغاء',
        confirm: 'تأكيد',
        delete: 'حذف',
        edit: 'تعديل',
        create: 'إنشاء',
        add: 'إضافة',
        filter: 'تصفية',
        export: 'تصدير',
        download: 'تنزيل',
        close: 'إغلاق',
        loading: 'جاري التحميل...',
        back: 'رجوع',
        next: 'التالي',
        previous: 'السابق',
        submit: 'إرسال',
        status: 'الحالة',
        name: 'الاسم',
        date: 'التاريخ',
        amount: 'المبلغ',
        actions: 'الإجراءات',
        total: 'الإجمالي',
        all: 'الكل',
        language: 'اللغة',
        arabic: 'العربية',
        english: 'English',
        switchLanguage: 'تغيير اللغة',
        active: 'نشط',
        completed: 'مكتمل',
        pending: 'قيد الانتظار',
        draft: 'مسودة',
        approved: 'معتمد',
        paid: 'مدفوع',
        void: 'ملغى',
        reimbursed: 'مسترد',
        rejected: 'مرفوض',
        online: 'متصل',
        offline: 'غير متصل',
        yes: 'نعم',
        no: 'لا',
        error: 'خطأ',
        success: 'نجاح',
      },
      auth: {
        login: 'تسجيل الدخول',
        register: 'إنشاء حساب',
        email: 'البريد الإلكتروني',
        password: 'كلمة المرور',
        terms: 'شروط الخدمة',
        privacy: 'سياسة الخصوصية',
      },
      dashboard: {
        overview: 'نظرة عامة على لوحة التحكم',
        cashFlow: 'التدفقات النقدية',
        recentActivity: 'النشاط الأخير',
        headcount: 'عدد الموظفين',
        activeSprints: 'الدورات النشطة',
        exceptions: 'الاستثناءات',
        openPipeline: 'قيمة الصفقات المفتوحة',
      },
    },
  },
}

export function applyLanguageDirection(lng) {
  const isArabic = lng === 'ar'
  const dir = isArabic ? 'rtl' : 'ltr'
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng
    document.documentElement.dir = dir
  }
  // Sync format locale (using Western Arabic numerals in Arabic for ERP consistency)
  setFormatDefaults({ locale: isArabic ? 'ar-EG-u-nu-latn' : 'en-US' })
}

const savedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('asas_lang') : null
const initialLang = savedLang === 'ar' ? 'ar' : 'en'

// Immediately set document direction and format locale
applyLanguageDirection(initialLang)

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  })

export async function changeLanguage(lng) {
  const targetLang = lng === 'ar' ? 'ar' : 'en'
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('asas_lang', targetLang)
  }
  applyLanguageDirection(targetLang)
  await i18n.changeLanguage(targetLang)
}

export default i18n
