import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
    const { i18n } = useTranslation();

    const toggleLanguage = () => {
        const newLang = i18n.language === 'zh' ? 'en' : 'zh';
        i18n.changeLanguage(newLang);
    };

    return (
        <button
            className="btn btn-sm btn-secondary language-switcher"
            onClick={toggleLanguage}
            title={i18n.language === 'zh' ? 'Switch to English' : '切换到中文'}
        >
            {i18n.language === 'zh' ? 'EN' : '中文'}
        </button>
    );
}
