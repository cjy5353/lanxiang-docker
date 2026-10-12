import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import Quiz from './Quiz';
import Admin from './Admin';
import './styles.css';
const admin = /\/admin(?:\/|\/index\.html)?$/.test(location.pathname);
document.title=admin?'兰香识人录 · 店主工作台':'兰香识人录 · 人物同频测评';
createRoot(document.getElementById('root')!).render(<StrictMode>{admin?<Admin/>:<Quiz/>}</StrictMode>);
