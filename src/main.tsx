import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import Quiz from './Quiz';
import Admin from './Admin';
import './styles.css';
const admin = /\/admin(?:\/|\/index\.html)?$/.test(location.pathname);
document.title=admin?'兰香识人录 · 演示管理页':'兰香识人录 · 非收费人物测评演示';
createRoot(document.getElementById('root')!).render(<StrictMode>{admin?<Admin/>:<Quiz/>}</StrictMode>);
