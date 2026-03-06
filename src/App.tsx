import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, User as SupabaseUser } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import posthog from 'posthog-js';
import OneSignal from 'react-onesignal';
import { 
  LayoutGrid, ChefHat, Plus, Trash2, 
  Sparkles, Clock, Flame, ArrowLeft, ShoppingBag, CheckCircle2, TrendingUp, 
  Save, Leaf, Scale, Check, BookOpen, 
  Repeat, ShoppingCart, CalendarDays, ListChecks, ChevronRight, 
  Utensils, PartyPopper, Star, Share2, Trash, Search, 
  ChevronLeft, ThermometerSnowflake, Settings2, X, Loader2, User, AlertCircle, Bell, Zap
} from 'lucide-react';

// --- 1. CONFIGURACIÓN DE SERVIDORES Y PRODUCCIÓN ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''; 
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''; 
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || '';
const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: 'https://eu.i.posthog.com',
    capture_pageview: true,
    autocapture: true,
  });
}

let isOneSignalInitialized = false;
if (ONESIGNAL_APP_ID) {
  OneSignal.init({ appId: ONESIGNAL_APP_ID, allowLocalhostAsSecureOrigin: true }).then(() => {
    isOneSignalInitialized = true;
  }).catch(console.error);
}

// --- 2. ESTILOS ANIMADOS PREMIUM ---
const CustomStyles = () => (
  <style dangerouslySetInnerHTML={{__html: `
    @keyframes wiggle { 0%, 100% { transform: rotate(-10deg) scale(1); } 50% { transform: rotate(10deg) scale(1.1); } }
    .animate-wiggle { animation: wiggle 1s ease-in-out infinite; }
    
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    .animate-float { animation: float 3s ease-in-out infinite; }
    
    @keyframes popIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    .animate-pop-in { animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    
    @keyframes fadeSlide { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
    .animate-fade-slide { animation: fadeSlide 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    
    @keyframes shimmer { 100% { transform: translateX(100%); } }
    .animate-shimmer { position: relative; overflow: hidden; }
    .animate-shimmer::after {
      content: ''; position: absolute; top: 0; right: 0; bottom: 0; left: 0;
      transform: translateX(-100%);
      background-image: linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,0.2) 20%, rgba(255,255,255,0.5) 60%, rgba(255,255,255,0));
      animation: shimmer 2s infinite;
    }

    .progress-bar-stripes { background-image: linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent); background-size: 1rem 1rem; animation: progress-stripes 1s linear infinite; }
    @keyframes progress-stripes { from { background-position: 1rem 0; } to { background-position: 0 0; } }
    
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `}} />
);

// --- 3. TIPOS E INTERFACES ESTRICTAS ---
type ExpiryStatus = 'fresh' | 'soon' | 'urgent';
type IngredientCat = 'veg' | 'protein' | 'dairy' | 'pantry';

interface Ingredient { id: string; name: string; quantity: string; expiryStatus: ExpiryStatus; category: IngredientCat; }
interface Recipe { title: string; description: string; time: string; calories: number; ingredients: string[]; steps: string[]; priceEstimate: number; wasteValue: number; date?: string; }
interface BatchMasterclass { intro: string; storage_tips: string[]; step_by_step: { phase: string; tasks: string[] }[]; }
interface MealPlan { type: 'daily' | 'batch'; lunch?: Recipe; lunch_alt?: Recipe; dinner?: Recipe; dinner_alt?: Recipe; days?: { day: number; lunch: Recipe; dinner: Recipe }[]; batch_masterclass?: BatchMasterclass; shopping_list?: string[]; }
interface UserProfile { name: string; style: string; allergies: string[]; people: number; ages: string; robot: string; }
interface ShoppingItem { id: string; name: string; checked: boolean; }
interface BatchConfig { days: number; meals: ('lunch'|'dinner')[]; }
type ViewState = 'auth' | 'onboarding' | 'dashboard' | 'pantry' | 'planner' | 'recipe-detail' | 'history' | 'shopping';

// --- 4. CONSTANTES DE DATOS ---
const STAPLES = [
  { name: 'Huevos', cat: 'protein' as IngredientCat },
  { name: 'Leche', cat: 'dairy' as IngredientCat },
  { name: 'Tomate', cat: 'veg' as IngredientCat },
  { name: 'Pollo', cat: 'protein' as IngredientCat },
  { name: 'Arroz', cat: 'pantry' as IngredientCat },
  { name: 'Pasta', cat: 'pantry' as IngredientCat },
  { name: 'Cebolla', cat: 'veg' as IngredientCat },
  { name: 'Ajo', cat: 'veg' as IngredientCat },
  { name: 'Patata', cat: 'pantry' as IngredientCat },
  { name: 'Atún', cat: 'pantry' as IngredientCat },
  { name: 'Yogur', cat: 'dairy' as IngredientCat }
];

const DIET_OPTIONS = [
  { id: 'Clásica', desc: 'Sin restricciones' },
  { id: 'Baja en Carbos', desc: 'Pocos azúcares y harinas' },
  { id: 'Keto', desc: 'Grasas saludables, cero carbos' },
  { id: 'Vegetariana', desc: 'Sin carne ni pescado' },
  { id: 'Vegana', desc: '100% origen vegetal' },
  { id: 'Antiinflamatoria', desc: 'Para cuidar tu intestino' }
];

const DISLIKES_OPTIONS = [
  'Aguacate', 'Ternera', 'Pimientos', 'Coliflor', 'Berenjena',
  'Huevos', 'Queso de cabra', 'Champiñones', 'Cerdo', 'Salmón',
  'Marisco', 'Atún', 'Cilantro', 'Lácteos', 'Gluten'
];

const ROBOT_OPTIONS = [
  'Ninguno (A mano)',
  'Robot tipo TM',
  'Freidora de aire',
  'Robot Multifunción',
  'Olla lenta'
];

const LOADING_MESSAGES = [
  "Afilando los cuchillos virtuales...",
  "Consultando el libro secreto de la abuela...",
  "Precalentando el horno a tope...",
  "Calculando cantidades exactas...",
  "Organizando tus comidas de la semana...",
  "Revisando tu lista de la compra...",
  "Emplatando virtualmente...",
  "Preguntando a los ingredientes qué quieren ser de mayores...",
  "Dándole un toque de amor a cada receta...",
  "Haciendo magia con lo que tienes..."
];

// --- 5. LÓGICA DE IA ---
const generateRealPlan = async (
  apiKey: string,
  ingredients: Ingredient[],
  profile: UserProfile,
  mode: 'aprovechamiento' | 'chef',
  planType: 'daily' | 'batch',
  batchConfig: BatchConfig,
  onAlert: (msg: string) => void
): Promise<MealPlan | null> => {
  try {
    if (!apiKey) throw new Error("Falta la API Key de Gemini");
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const urgentIngs = ingredients.filter(i => i.expiryStatus === 'urgent').map(i => i.name).join(", ");
    const availableIngs = ingredients.map(i => i.name).join(", ");
    const context = mode === 'aprovechamiento'
      ? `CRÍTICO (caduca ya): ${urgentIngs}. OTROS: ${availableIngs}.`
      : `USAR: ${availableIngs}.`;
    
    let safeAllergies: string[] = [];
    if (Array.isArray(profile.allergies)) safeAllergies = profile.allergies;
    else if (typeof profile.allergies === 'string') safeAllergies = [profile.allergies];
    const allergiesText = safeAllergies.length > 0 ? safeAllergies.join(", ") : "Ninguna";

    let taskPrompt = "";
    let jsonSchema = "";

    const modeInstructions = mode === 'aprovechamiento'
      ? `¡ATENCIÓN! ESTÁS EN MODO 'CERO SOBRAS'. REGLA DE ORO: usa EXCLUSIVAMENTE los ingredientes disponibles. PROHIBIDO añadir ingredientes principales nuevos a la 'shopping_list'. 
        CRÍTICO: El campo 'wasteValue' NUNCA puede ser 0. Debes asignar un valor estimado (Ej: 3.50) que represente el dinero salvado.`
      : `Estás en MODO CHEF. Libertad creativa. Puedes añadir ingredientes a la 'shopping_list' si es necesario. wasteValue puede ser bajo o 0.`;

    const commonRules = `
      REGLAS GENERALES ESTRICTAS:
      1. GRAMOS EXACTOS. Adapta todo para ${profile.people} personas (${profile.ages}).
      2. Adapta los pasos a: ${profile.robot || 'olla/sartén'}.
      3. REGLA ANTI-ESPECIAS: NUNCA incluyas sal, pimienta, aceite, agua o especias en la 'shopping_list'.
      4. TONO: Descripciones cálidas y amigables (Mr. Wonderful).
      5. 🚨 REGLA DE COMPRA: En 'shopping_list', usa SIEMPRE UNIDADES MÉTRICAS ESTÁNDAR (g o ml). ESTÁ ESTRICTAMENTE PROHIBIDO usar "ud", "unidades", "piezas", "dientes" o "manojos". 
         El formato debe ser estrictamente: "[Número] [g/ml] [Nombre del ingrediente]".
    `;

    if (planType === 'daily') {
      taskPrompt = `TAREA: Menú 1 día. Genera Opción A y B para Almuerzo y Cena. Crea 'shopping_list' con lo que falta.\n${modeInstructions}`;
      jsonSchema = `ESTRUCTURA JSON EXACTA: { "type": "daily", "lunch": {Recipe}, "lunch_alt": {Recipe}, "dinner": {Recipe}, "dinner_alt": {Recipe}, "shopping_list": ["Ingrediente 1"] }`;
    } else {
      taskPrompt = `TAREA: BATCH COOKING de ${batchConfig.days} DÍAS. Solo recetas: ${batchConfig.meals.join(" y ")}. 
        REGLA BATCH 1: Prioriza el horno en 'step_by_step' para asar a la vez.
        REGLA BATCH 2: No inventes tareas sin ingredientes.
        REGLA BATCH 3: En 'storage_tips', di qué plato va en cada tupper.
        ${modeInstructions}`;
      jsonSchema = `ESTRUCTURA JSON EXACTA: { "type": "batch", "batch_masterclass": { "intro": "Resumen", "storage_tips": ["..."], "step_by_step": [{"phase": "Fase", "tasks": ["..."]}] }, "days": [ { "day": 1, "lunch": {Recipe}, "dinner": {Recipe} } ], "shopping_list": ["Ingrediente 1"] }`;
    }

    const basePrompt = `
      Chef Experto con alma de poeta. PERFIL: ${profile.style}. PAX: ${profile.people} (${profile.ages}). ODIOS: ${allergiesText}.
      INGREDIENTES EN NEVERA: ${context}.
      ${taskPrompt}
      ${commonRules}
      Formato interno de Recipe: {"title":"", "description":"", "time":"", "calories":0, "ingredients":[""], "steps":[""], "priceEstimate":0, "wasteValue":0}
    `;

    const result = await model.generateContent(basePrompt + "\n" + jsonSchema);
    
    let rawText = result.response.text();
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(rawText);
    
    if (POSTHOG_KEY) posthog.capture('plan_generated', { mode, planType, days: batchConfig.days });
    
    return parsed;
  } catch (error: any) {
    console.error("Error silencioso de IA:", error);
    if (POSTHOG_KEY) posthog.capture('plan_generation_error', { error: error.message });
    return null;
  }
};

// --- 6. COMPONENTES VISUALES COMPARTIDOS ---

const CustomAlert = ({ message, onClose }: { message: string, onClose: () => void }) => {
  if (!message) return null;
  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[200] animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 text-center border-2 border-stone-100">
        <div className="w-16 h-16 bg-teal-50 text-teal-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <AlertCircle size={32} className="animate-wiggle" />
        </div>
        <p className="text-stone-800 font-bold text-lg mb-8 leading-relaxed">{message}</p>
        <button onClick={onClose} className="w-full py-4 bg-stone-900 hover:bg-black text-white rounded-xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-md">
          Entendido
        </button>
      </div>
    </div>
  );
};

// 🚀 NUEVO: COMPONENTE DE CONFIRMACIÓN (Adios al alert nativo feo)
const CustomConfirm = ({ message, onConfirm, onCancel }: { message: string, onConfirm: () => void, onCancel: () => void }) => {
  if (!message) return null;
  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[200] animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 text-center border-2 border-stone-100">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <AlertCircle size={32} className="animate-wiggle" />
        </div>
        <p className="text-stone-800 font-bold text-lg mb-8 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-4 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all">
            Cancelar
          </button>
          <button onClick={onConfirm} className="flex-1 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-sm uppercase tracking-widest active:scale-95 transition-all shadow-md">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
};

const FormattedText = ({ text }: { text: string }) => {
  if (typeof text !== 'string') return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <span>
      {parts.map((part, i) => (
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i} className="font-black text-teal-700">{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      ))}
    </span>
  );
};

const PsychologicalLoader = ({ startTime }: { startTime: number }) => {
  const [progress, setProgress] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const calculatedProgress = Math.min(98, Math.floor((elapsed / 14000) * 100));
      setProgress(calculatedProgress);
      setMsgIdx(Math.floor(elapsed / 4000) % LOADING_MESSAGES.length);
    }, 500);
    return () => clearInterval(timer);
  }, [startTime]);

  return (
    <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-stone-100 shadow-xl animate-in fade-in zoom-in-95 mt-6">
      <div className="w-24 h-24 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner animate-pulse-slow">
        <ChefHat className="text-teal-500 animate-wiggle" size={48} />
      </div>
      <h3 className="text-xl font-black text-stone-800 mb-2 px-6 h-14 flex items-center justify-center animate-fade-slide" key={msgIdx}>
        {LOADING_MESSAGES[msgIdx]}
      </h3>
      <p className="text-stone-400 font-medium mb-10">La magia requiere su tiempo...</p>
      
      <div className="w-3/4 mx-auto bg-stone-100 h-4 rounded-full overflow-hidden shadow-inner relative">
        <div className="absolute top-0 left-0 h-full bg-teal-500 rounded-full transition-all duration-300 ease-out progress-bar-stripes" style={{width: `${Math.min(progress, 98)}%`}}></div>
      </div>
      <p className="text-teal-600 font-black mt-3 text-sm">{progress}%</p>
    </div>
  );
};

// --- 7. VISTAS PRINCIPALES ---

interface AuthViewProps { onAlert: (msg: string) => void; }
const AuthView = ({ onAlert }: AuthViewProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) return onAlert("Por favor, rellena todos los campos.");
    setLoading(true);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) onAlert(error.message);
      else {
        if (POSTHOG_KEY) posthog.capture('user_signed_up');
        onAlert("¡Cuenta creada! Ya puedes iniciar sesión.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) onAlert("Error al iniciar sesión: " + error.message);
      else if (POSTHOG_KEY) posthog.capture('user_logged_in');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col justify-center p-8 animate-in fade-in">
      <CustomStyles />
      <div className="max-w-md mx-auto w-full">
        <div className="text-center mb-10">
          <div className="w-32 h-32 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-float">
            <ChefHat className="text-teal-600 animate-wiggle" size={60}/>
          </div>
          <h1 className="text-4xl font-black text-stone-800 mb-2 tracking-tight">PlatoPlan</h1>
          <p className="text-stone-500 font-medium text-lg">Tu cocina inteligente empieza aquí.</p>
        </div>
        
        <div className="space-y-4">
          <input 
            type="email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            placeholder="Tu correo electrónico" 
            className="w-full p-5 rounded-2xl border-2 border-stone-200 outline-none focus:border-teal-500 font-bold bg-white text-stone-800 shadow-sm transition-all" 
          />
          <input 
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder="Tu contraseña secreta" 
            className="w-full p-5 rounded-2xl border-2 border-stone-200 outline-none focus:border-teal-500 font-bold bg-white text-stone-800 shadow-sm transition-all" 
          />
          <button 
            onClick={handleAuth} 
            disabled={loading} 
            className="w-full py-5 bg-stone-900 text-white rounded-2xl font-black text-xl shadow-xl active:scale-95 transition-all mt-4 flex justify-center items-center h-16 hover:bg-black"
          >
            {loading ? <Loader2 className="animate-spin" size={24}/> : (isSignUp ? 'Unirse a la tribu' : 'Entrar a la cocina')}
          </button>
          
          <p onClick={() => setIsSignUp(!isSignUp)} className="text-center text-stone-400 font-bold text-sm cursor-pointer mt-6 hover:text-stone-600 transition-colors">
            {isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿Eres nuevo? Crea tu cuenta gratis'}
          </p>
        </div>
      </div>
    </div>
  );
};

interface OnboardingProps { onComplete: () => void; profile: UserProfile; setProfile: (p: UserProfile) => void; }
const OnboardingView = ({ onComplete, profile, setProfile }: OnboardingProps) => {
  const [step, setStep] = useState(0); 
  const [customAllergy, setCustomAllergy] = useState('');
  
  const INTRO_SLIDES = [
    { title: "Planificación a tu medida", text: "Elige tus comidas en minutos. Con opciones ilimitadas, come exactamente como quieres.", icon: <BookOpen size={80} className="text-stone-700"/>, color: "bg-teal-100" },
    { title: "Compra sin estrés", text: "Haz la compra una vez a la semana con una lista organizada automáticamente.", icon: <ShoppingBag size={80} className="text-stone-700"/>, color: "bg-orange-100" },
    { title: "Zero Waste Real", text: "Dile a la app qué tienes a punto de caducar y crearemos magia para no tirar nada.", icon: <Leaf size={80} className="text-stone-700"/>, color: "bg-rose-100" }
  ];

  const toggleDislike = (item: string) => {
    const safeAllergies = Array.isArray(profile.allergies) ? profile.allergies : [];
    setProfile({
      ...profile,
      allergies: safeAllergies.includes(item)
        ? safeAllergies.filter((a:any) => a !== item)
        : [...safeAllergies, item]
    });
  };

  const addCustomAllergy = () => {
    if (customAllergy.trim() && !(profile.allergies||[]).includes(customAllergy.trim())) {
      toggleDislike(customAllergy.trim());
      setCustomAllergy('');
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col p-6 text-stone-900 animate-in fade-in">
      <CustomStyles />
      {step > 0 && (
        <div className="flex items-center mb-6 pt-4">
          <button onClick={() => setStep(step - 1)} className="text-stone-400 font-bold flex items-center gap-1 hover:text-stone-600 transition-colors">
            <ChevronLeft size={20}/> Atrás
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        {step < 3 && (
          <div className="text-center animate-in slide-in-from-right-8 duration-500 flex flex-col items-center justify-center h-full pb-10">
            <h1 className="text-3xl font-black mb-10 tracking-tight leading-tight">{INTRO_SLIDES[step].title}</h1>
            <div className={`w-48 h-48 ${INTRO_SLIDES[step].color} rounded-[3rem] flex items-center justify-center mb-10 transform rotate-3 shadow-lg`}>
              <div className="transform -rotate-3">{INTRO_SLIDES[step].icon}</div>
            </div>
            <p className="text-stone-500 text-lg mb-12 font-medium leading-relaxed px-4">{INTRO_SLIDES[step].text}</p>
            
            <div className="flex gap-3 justify-center mb-10">
              {[0,1,2].map((i) => (
                <div key={i} className={`h-2.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-stone-800' : 'w-2 bg-stone-200'}`}></div>
              ))}
            </div>
            <button onClick={() => setStep(step + 1)} className="w-full py-5 bg-[#5CB82C] text-white rounded-[1rem] font-bold text-lg shadow-md active:scale-95 transition-transform hover:bg-[#4a9c22]">
              Continuar
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="animate-in slide-in-from-right-8 duration-500 pb-10 flex flex-col h-full mt-4">
            <h2 className="text-4xl font-black mb-8">Elige tu dieta</h2>
            <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar pb-4">
              {DIET_OPTIONS.map(diet => {
                const isSel = profile.style === diet.id;
                return (
                  <button
                    key={diet.id}
                    onClick={() => { setProfile({...profile, style: diet.id}); setTimeout(() => setStep(4), 300); }}
                    className={`w-full p-6 rounded-[1rem] text-left transition-all flex justify-between items-center ${
                      isSel ? 'bg-[#FBE885] border-transparent shadow-md transform scale-[1.02]' : 'bg-stone-50 border border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="font-bold text-xl">{diet.id}</span>
                    {isSel && <span className="text-xs font-bold text-stone-600 uppercase tracking-widest">{diet.desc}</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setStep(4)} className="w-full py-5 bg-[#5CB82C] text-white rounded-[1rem] font-bold text-lg shadow-md active:scale-95 transition-transform mt-6">
              Siguiente Paso
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="animate-in slide-in-from-right-8 duration-500 flex flex-col h-full pb-10 mt-4">
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-4xl font-black leading-tight">¿Algo que<br/>evitar?</h2>
            </div>
            
            <div className="flex gap-2 mb-6">
              <input
                value={customAllergy}
                onChange={e => setCustomAllergy(e.target.value)}
                placeholder="Ej: Canela, Manzana..."
                className="flex-1 p-4 rounded-xl border-2 border-stone-200 outline-none focus:border-teal-500 font-bold bg-stone-50 text-stone-800"
                onKeyDown={e => e.key === 'Enter' && addCustomAllergy()}
              />
              <button onClick={addCustomAllergy} className="bg-stone-900 text-white p-4 rounded-xl px-6 font-bold shadow-md active:scale-95 transition-transform">
                Añadir
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="flex flex-wrap gap-3 pb-6">
                {Array.from(new Set([...(profile.allergies||[]), ...DISLIKES_OPTIONS])).map(a => {
                  const isSel = (profile.allergies||[]).includes(a as string);
                  return (
                    <button
                      key={a as string}
                      onClick={() => toggleDislike(a as string)}
                      className={`px-5 py-4 rounded-[1rem] font-bold text-base transition-all ${
                        isSel ? 'bg-stone-800 text-white shadow-md transform scale-105' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      {a as string}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={() => onComplete()} className="w-full py-5 bg-stone-900 text-white rounded-[1rem] font-black text-xl shadow-xl active:scale-95 transition-transform mt-6 hover:bg-black">
              ¡Comenzar a Cocinar!
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface DashboardProps { savings: number; wasteSaved: number; totalItems: number; profileName: string; }
const DashboardView = ({ savings, wasteSaved, totalItems, profileName }: DashboardProps) => {
  const level = useMemo(() => {
    if (savings < 30) return { name: "Pinche con Arte", icon: "🌱", color: "text-stone-500", next: 30 };
    if (savings < 100) return { name: "Chef Saleroso", icon: "👨‍🍳", color: "text-teal-500", next: 100 };
    if (savings < 250) return { name: "Héroe del Tupper", icon: "🍱", color: "text-blue-500", next: 250 };
    return { name: "Estrella Michelin", icon: "⭐", color: "text-amber-500", next: 1000 };
  }, [savings]);
  
  const progress = Math.min(100, (savings / level.next) * 100);

  const GREETINGS = ["Hoy huele a éxito", "¡A por todas, chef!", "Tu cocina manda", "Preparando magia...", "¡Día perfecto para cocinar!", "La nevera te sonríe", "Arte en los fogones"];
  const dailyGreeting = GREETINGS[new Date().getDay() % GREETINGS.length];

  return (
    <div className="p-6 pt-10 pb-32 animate-in fade-in duration-500 bg-[#FDFBF7] min-h-full">
      <CustomStyles/>
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-stone-800 tracking-tight">¡Hola, {profileName}!</h1>
          <p className="text-stone-400 text-sm font-bold mt-1">{dailyGreeting}</p>
        </div>
        <div className="bg-white p-3 rounded-2xl shadow-sm border border-stone-100">
          <ChefHat className="text-teal-500 animate-wiggle" size={24} />
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-[2rem] border-2 border-stone-100 shadow-sm mb-6">
        <div className="flex justify-between items-end mb-3">
          <div>
            <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest block mb-1">Tu Nivel</span>
            <h3 className={`text-xl font-black ${level.color} flex items-center gap-2`}>{level.icon} {level.name}</h3>
          </div>
          <span className="text-xs font-black text-stone-400 bg-stone-50 px-3 py-1.5 rounded-xl">{savings.toFixed(0)}€ / {level.next}€</span>
        </div>
        <div className="w-full bg-stone-100 h-3 rounded-full overflow-hidden">
          <div className="bg-gradient-to-r from-teal-300 to-teal-500 h-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 bg-stone-900 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-orange-400/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <p className="text-stone-300 text-xs font-black uppercase tracking-widest mb-1 flex items-center gap-2"><PartyPopper size={14}/> Ahorrado Total</p>
          <div className="flex items-baseline gap-1">
            <h2 className="text-6xl font-black tracking-tighter">{savings.toFixed(0)}</h2>
            <span className="text-2xl font-bold text-orange-400">€</span>
          </div>
        </div>
        
        <div className="bg-teal-50 p-5 rounded-[2rem] border-2 border-teal-100 shadow-sm text-center">
          <p className="text-teal-600 text-[10px] font-black uppercase tracking-widest mb-1">Cero Sobras</p>
          <h4 className="text-3xl font-black text-teal-800">{wasteSaved.toFixed(0)}€</h4>
        </div>
        
        <div className="bg-orange-50 p-5 rounded-[2rem] border-2 border-orange-100 shadow-sm text-center">
          <p className="text-orange-600 text-[10px] font-black uppercase tracking-widest mb-1">En Nevera</p>
          <h4 className="text-3xl font-black text-orange-800">{totalItems}</h4>
        </div>
      </div>
    </div>
  );
};

interface PantryProps { ingredients: Ingredient[]; setIngredients: (i: Ingredient[]) => void; }
const PantryView = ({ ingredients, setIngredients }: PantryProps) => {
  const [name, setName] = useState('');
  
  const add = (n: string, cat: IngredientCat = 'pantry') => {
    if (!n.trim()) return;
    setIngredients([{ id: Date.now().toString(), name: n, quantity: '1', expiryStatus: 'fresh', category: cat }, ...ingredients]);
    setName('');
    if (POSTHOG_KEY) posthog.capture('ingredient_added', { name: n, category: cat });
  };

  const toggleStatus = (id: string) => {
    setIngredients(ingredients.map((i: any) => {
      if (i.id !== id) return i;
      const next: Record<ExpiryStatus, ExpiryStatus> = { 'fresh': 'soon', 'soon': 'urgent', 'urgent': 'fresh' };
      return { ...i, expiryStatus: next[i.expiryStatus] };
    }));
  };

  const PANTRY_PHRASES = [
    "Todo lo que tenemos para aprovechar.",
    "¡Vamos a darle vida a estos ingredientes!",
    "Cero desperdicio, máximo sabor.",
    "Tu lienzo en blanco culinario.",
    "Aquí empieza la magia."
  ];
  const dailyPhrase = PANTRY_PHRASES[new Date().getDay() % PANTRY_PHRASES.length];

  return (
    <div className="p-6 pt-10 pb-32 animate-in fade-in bg-[#FDFBF7] min-h-full">
      <h1 className="text-3xl font-black mb-2 text-stone-800">Mi Neverita</h1>
      <p className="text-stone-400 text-sm mb-6 font-medium italic">{dailyPhrase}</p>
      
      <div className="flex gap-3 mb-6">
        <input 
          value={name} 
          onChange={e => setName(e.target.value)} 
          className="flex-1 p-4 rounded-2xl border-2 border-stone-200 outline-none font-bold text-stone-700 focus:border-teal-500 shadow-sm transition-all" 
          placeholder="Añadir ingrediente..." 
          onKeyDown={e => e.key === 'Enter' && add(name)}
        />
        <button onClick={() => add(name)} className="bg-teal-500 hover:bg-teal-600 text-white p-4 rounded-2xl transition-colors shadow-md active:scale-95">
          <Plus size={24}/>
        </button>
      </div>
      
      <div className="mb-6 overflow-x-auto pb-2 flex gap-2 no-scrollbar">
        {STAPLES.map(s => (
          <button
            key={s.name}
            onClick={() => add(s.name, s.cat)}
            className="whitespace-nowrap px-4 py-2 bg-white border border-stone-200 rounded-full text-xs font-bold text-stone-500 active:scale-95 hover:bg-stone-50 transition-colors shadow-sm"
          >
            {s.name}
          </button>
        ))}
      </div>
      
      <div className="space-y-3">
        {ingredients.length === 0 && (
          <div className="text-center py-20 opacity-30 animate-pulse">
            <Utensils size={48} className="mx-auto mb-4"/>
            <p className="font-bold text-lg">Nevera vacía</p>
            <p className="text-sm">Añade algo para empezar</p>
          </div>
        )}
        
        {ingredients.map((i: any, index: number) => (
          <div
            key={i.id}
            className="bg-white p-4 rounded-[1.5rem] border-2 border-stone-100 flex justify-between items-center shadow-sm hover:shadow-md transition-all animate-fade-slide"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full shadow-sm ${
                i.expiryStatus === 'urgent' ? 'bg-rose-400 animate-pulse' :
                i.expiryStatus === 'soon' ? 'bg-amber-400' : 'bg-teal-400'
              }`}></div>
              <span className="font-bold capitalize text-stone-800 text-lg">{i.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleStatus(i.id)}
                className={`text-[10px] font-black px-3 py-2 rounded-xl border-2 uppercase tracking-widest transition-colors ${
                  i.expiryStatus === 'urgent' ? 'bg-rose-50 text-rose-500 border-rose-100' :
                  i.expiryStatus === 'soon' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                  'bg-teal-50 text-teal-600 border-teal-100'
                }`}
              >
                {i.expiryStatus === 'urgent' ? '¡SOS! YA' : i.expiryStatus === 'soon' ? 'PRONTO' : 'FRESQUÍSIMO'}
              </button>
              <button
                onClick={() => setIngredients(ingredients.filter((x: any) => x.id !== i.id))}
                className="text-stone-300 hover:text-rose-500 transition-colors p-2 bg-stone-50 rounded-lg active:scale-90"
              >
                <Trash2 size={20}/>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ShoppingProps { list: ShoppingItem[]; setList: (l: ShoppingItem[]) => void; onAlert: (m: string) => void; }
const ShoppingView = ({ list, setList, onAlert }: ShoppingProps) => {
  const [n, setN] = useState('');
  
  const add = () => {
    if (n.trim()) {
      setList([{ id: Date.now().toString(), name: n, checked: false }, ...list]);
      setN('');
    }
  };

  const toggle = (id: string) => {
    setList(list.map((x: any) => x.id === id ? { ...x, checked: !x.checked } : x));
  };
  
  const share = () => {
    const txt = "🛒 Lista PlatoPlan\n\n" + list.map((i: any) => `${i.checked ? '✅' : '⬜'} ${i.name}`).join('\n');
    if (navigator.share) {
      navigator.share({ title: 'Lista de Compra', text: txt }).catch(console.error);
    } else {
      const dummy = document.createElement("textarea");
      document.body.appendChild(dummy);
      dummy.value = txt;
      dummy.select();
      document.execCommand("copy");
      document.body.removeChild(dummy);
      onAlert("¡Copiado al portapapeles!");
    }
  };

  return (
    <div className="p-6 pt-10 pb-32 bg-[#FDFBF7] min-h-full animate-in fade-in">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black text-stone-800">Comprar</h1>
        {list.length > 0 && (
          <button onClick={share} className="p-3 bg-white border border-stone-200 rounded-xl text-stone-600 shadow-sm active:scale-95 transition-transform hover:bg-stone-50">
            <Share2 size={20}/>
          </button>
        )}
      </div>
      
      <div className="flex gap-3 mb-8">
        <input 
          value={n} 
          onChange={e => setN(e.target.value)} 
          className="flex-1 p-4 rounded-2xl border-2 border-stone-200 outline-none font-bold text-stone-700 shadow-sm focus:border-orange-400 transition-all" 
          placeholder="¿Qué falta en casa?" 
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button onClick={add} className="bg-orange-400 hover:bg-orange-500 text-white p-4 rounded-2xl shadow-md active:scale-95 transition-all">
          <Plus size={24}/>
        </button>
      </div>
      
      <div className="space-y-3">
        {list.length === 0 ? (
          <div className="text-center py-20 opacity-30">
            <ShoppingCart size={56} className="mx-auto mb-4"/>
            <p className="font-bold text-lg text-stone-500">Todo comprado.</p>
            <p className="text-sm text-stone-400">Eres una máquina de la organización.</p>
          </div>
        ) : (
          list.map((i: any, index: number) => (
            <div
              key={i.id}
              onClick={() => toggle(i.id)}
              className={`p-5 rounded-[1.5rem] border-2 flex items-center gap-4 cursor-pointer transition-all animate-fade-slide ${
                i.checked ? 'opacity-50 bg-stone-50 border-transparent' : 'bg-white border-stone-100 shadow-sm hover:shadow-md hover:-translate-y-0.5'
              }`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                i.checked ? 'bg-teal-500 border-teal-500' : 'border-stone-300'
              }`}>
                {i.checked && <Check size={16} className="text-white" strokeWidth={3}/>}
              </div>
              <span className={`text-lg font-bold ${i.checked ? 'line-through text-stone-400' : 'text-stone-800'}`}>{i.name}</span>
            </div>
          ))
        )}
      </div>
      
      {list.some((i: any) => i.checked) && (
        <button
          onClick={() => setList(list.filter((x: any) => !x.checked))}
          className="w-full mt-10 py-5 bg-rose-50 text-rose-500 hover:bg-rose-100 font-black rounded-[1.5rem] uppercase tracking-widest text-sm transition-colors border border-rose-100 shadow-sm"
        >
          Limpiar completados
        </button>
      )}
    </div>
  );
};

// 🚀 REFACTORIZACIÓN DEL RECETARIO: Borrado individual y UX
interface HistoryProps { history: Recipe[]; onDeleteAll: () => void; onDeleteRecipe: (r: Recipe) => void; onViewRecipe: (r: Recipe) => void; }
const HistoryView = ({ history, onDeleteAll, onDeleteRecipe, onViewRecipe }: HistoryProps) => {
  const [search, setSearch] = useState('');
  const filtered = history.filter((r: any) => (r.title || '').toLowerCase().includes(search.toLowerCase()));
  
  return (
    <div className="p-6 pt-10 pb-32 bg-[#FDFBF7] min-h-full animate-in fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-black text-stone-800">El Recetario</h1>
          <p className="text-stone-400 text-sm font-medium italic mt-1">Tus platos estrella guardados.</p>
        </div>
        {history.length > 0 && (
          <button
            onClick={onDeleteAll}
            className="text-rose-400 p-3 bg-white rounded-xl shadow-sm border border-stone-100 hover:bg-rose-50 transition-colors active:scale-95"
          >
            <Trash size={20}/>
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="relative mb-8 shadow-sm">
          <Search className="absolute left-4 top-4.5 text-stone-400" size={20}/>
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Buscar receta guardada..." 
            className="w-full p-4 pl-12 bg-white border-2 border-stone-100 rounded-[1.5rem] outline-none font-bold text-stone-700 focus:border-teal-400 transition-colors"
          />
        </div>
      )}
      
      {filtered.length === 0 ? (
        <div className="text-center py-20 opacity-30">
          <Star size={56} className="mx-auto mb-4"/>
          <p className="font-bold text-lg text-stone-500">
            {history.length === 0 ? 'Recetario en blanco.' : 'No encontré esa receta.'}
          </p>
          {history.length === 0 && <p className="text-sm text-stone-400">¡A los fogones!</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((r: any, i: number) => (
            <div
              key={i}
              onClick={() => onViewRecipe(r)}
              className="bg-white p-6 rounded-[2rem] border-2 border-stone-100 shadow-sm flex justify-between items-center hover:shadow-md transition-all group animate-fade-slide cursor-pointer hover:border-teal-200"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex-1 pr-4">
                <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest block mb-1">{r.date || 'Reciente'}</span>
                <h3 className="text-lg font-black text-stone-800 leading-tight mb-2 group-hover:text-teal-600 transition-colors">{r.title}</h3>
                <p className="text-xs text-stone-400 font-bold flex items-center gap-1">
                  <Flame size={12} className="text-orange-400"/> {r.calories} kcal
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="bg-teal-50 text-teal-600 font-black px-4 py-2 rounded-[1rem] text-sm shadow-sm border border-teal-100">
                  +{r.wasteValue}€
                </div>
                <div className="flex gap-2">
                  {/* 🚀 BOTÓN INDIVIDUAL DE BORRAR RECETA */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteRecipe(r); }}
                    className="bg-rose-50 p-2 rounded-full text-rose-400 hover:bg-rose-500 hover:text-white transition-colors"
                  >
                    <Trash2 size={18}/>
                  </button>
                  <div className="bg-stone-50 p-2 rounded-full text-stone-300 group-hover:bg-teal-50 group-hover:text-teal-500 transition-colors">
                    <ChevronRight size={18}/>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface TribeSettingsProps { profile: UserProfile; setProfile: (p: UserProfile) => void; onClose: () => void; onLogout: () => void; onAlert: (m:string)=>void; }
const TribeSettings = ({ profile, setProfile, onClose, onLogout, onAlert }: TribeSettingsProps) => {
  const [l, setL] = useState(profile);
  const [customAllergy, setCustomAllergy] = useState('');
  const [pushGranted, setPushGranted] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && OneSignal && isOneSignalInitialized) {
      setPushGranted(Notification.permission === "granted");
    }
  }, []);

  const toggleAllergy = (allergy: string) => {
    const current = Array.isArray(l.allergies) ? l.allergies : [];
    setL({
      ...l,
      allergies: current.includes(allergy)
        ? current.filter((a: string) => a !== allergy)
        : [...current, allergy]
    });
  };
  
  const addCustomAllergy = () => {
    if (customAllergy.trim() && !(l.allergies || []).includes(customAllergy.trim())) {
      toggleAllergy(customAllergy.trim());
      setCustomAllergy('');
    }
  };

  const requestNotifications = async () => {
    try {
      if (typeof window !== 'undefined' && OneSignal && isOneSignalInitialized) {
        await OneSignal.Slidedown.promptPush();
        setPushGranted(Notification.permission === "granted");
      } else {
        onAlert("Las notificaciones están bloqueadas en tu navegador actual. Recuerda que en iPhone debes 'Añadir a la pantalla de inicio' primero.");
      }
    } catch (error) {
      console.error(error);
      onAlert("No se pudieron activar las notificaciones. Revisa los ajustes de tu teléfono.");
    }
  };

  return (
    <div className="bg-white rounded-[2rem] border-2 border-stone-100 p-6 shadow-xl mb-8 animate-in slide-in-from-top-4 relative z-20">
      <button onClick={onClose} className="absolute top-6 right-6 text-stone-400 hover:text-stone-800 bg-stone-100 p-2 rounded-full transition-colors">
        <X size={20}/>
      </button>
      <h2 className="text-2xl font-black text-stone-800 mb-8 flex items-center gap-2">
        <Settings2 className="text-teal-500"/> Ajustes
      </h2>
      
      <div className="space-y-8">
        <div>
          <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 block">Comensales y Edades</label>
          <div className="flex gap-4 items-center mb-4 bg-stone-50 p-2 rounded-[1.5rem] w-fit border border-stone-100">
            <button onClick={() => setL({ ...l, people: Math.max(1, l.people - 1) })} className="w-12 h-12 rounded-xl bg-white shadow-sm font-black text-xl text-stone-600 active:scale-95 transition-transform">
              -
            </button>
            <span className="text-2xl font-black text-stone-800 w-8 text-center">{l.people}</span>
            <button onClick={() => setL({ ...l, people: l.people + 1 })} className="w-12 h-12 rounded-xl bg-teal-500 text-white shadow-md font-black text-xl active:scale-95 transition-transform">
              +
            </button>
          </div>
          <input
            value={l.ages}
            onChange={e => setL({ ...l, ages: e.target.value })}
            placeholder="Ej: 2 Adultos, 1 Niño (5 años)"
            className="w-full p-4 bg-white rounded-xl font-bold border-2 border-stone-100 outline-none focus:border-teal-400 text-stone-700 text-sm shadow-sm transition-colors"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 block">Dieta</label>
            <select
              value={l.style}
              onChange={e => setL({ ...l, style: e.target.value })}
              className="w-full p-4 bg-white rounded-xl font-bold border-2 border-stone-100 outline-none focus:border-teal-400 text-stone-700 text-sm shadow-sm transition-colors"
            >
              {DIET_OPTIONS.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2 block">Robot</label>
            <select
              value={l.robot}
              onChange={e => setL({ ...l, robot: e.target.value })}
              className="w-full p-4 bg-white rounded-xl font-bold border-2 border-stone-100 outline-none focus:border-teal-400 text-stone-700 text-sm shadow-sm transition-colors"
            >
              {ROBOT_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 block flex justify-between">
            <span>Alergias / Odios</span>
            <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded-md">{Array.isArray(l.allergies) ? l.allergies.length : 0} Activas</span>
          </label>
          <div className="flex gap-2 mb-4">
            <input
              value={customAllergy}
              onChange={e => setCustomAllergy(e.target.value)}
              placeholder="Ej: Canela..."
              className="flex-1 p-3 rounded-xl border-2 border-stone-100 outline-none focus:border-orange-400 font-bold text-sm bg-white shadow-sm transition-colors"
              onKeyDown={e => e.key === 'Enter' && addCustomAllergy()}
            />
            <button onClick={addCustomAllergy} className="bg-stone-800 hover:bg-stone-900 text-white px-5 rounded-xl font-bold text-sm shadow-md transition-colors active:scale-95">
              Añadir
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto no-scrollbar pb-4">
            {Array.from(new Set([...(l.allergies || []), ...DISLIKES_OPTIONS])).map(a => {
              const isSel = (l.allergies || []).includes(a as string);
              return (
                <button
                  key={a as string}
                  onClick={() => toggleAllergy(a as string)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all border-2 ${
                    isSel
                      ? 'bg-orange-400 text-white border-orange-400 shadow-md transform scale-105'
                      : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-white hover:border-orange-200'
                  }`}
                >
                  {a as string}
                </button>
              );
            })}
          </div>
        </div>
        
        <div className="pt-4 border-t border-stone-100 space-y-3">
          {!pushGranted ? (
            <button
              onClick={requestNotifications}
              className="w-full py-4 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded-2xl font-bold text-sm transition-colors flex justify-center items-center gap-2 border border-teal-100 active:scale-95"
            >
              <Bell size={18}/> Activar Notificaciones
            </button>
          ) : (
            <div className="w-full py-4 bg-stone-50 text-stone-400 rounded-2xl font-bold text-sm flex justify-center items-center gap-2 border border-stone-100">
              <CheckCircle2 size={18} className="text-teal-500"/> Notificaciones Activadas
            </div>
          )}

          <button
            onClick={() => { setProfile(l); onClose(); }}
            className="w-full py-5 bg-stone-900 hover:bg-black text-white rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all flex justify-center items-center gap-2"
          >
            <Save size={20}/> Guardar Ajustes
          </button>
          <button
            onClick={onLogout}
            className="w-full py-4 text-rose-500 bg-rose-50 hover:bg-rose-100 rounded-2xl font-bold text-xs uppercase tracking-widest transition-colors flex justify-center items-center gap-2"
          >
            <User size={16}/> Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
};

interface PlannerProps {
  plan: MealPlan | null; onReset: () => void; loading: boolean; loadingStartTime: number;
  onGenerate: () => void; planType: 'daily'|'batch'; setPlanType: (t: 'daily'|'batch') => void;
  mode: 'aprovechamiento'|'chef'; setMode: (m: 'aprovechamiento'|'chef') => void;
  profile: UserProfile; setProfile: (p: UserProfile) => void; onViewRecipe: (r: Recipe) => void;
  batchConfig: BatchConfig; setBatchConfig: (c: BatchConfig) => void; onLogout: () => void;
  onAddMissingToShoppingList: (i: string[]) => void; onAlert: (m:string)=>void;
}
const PlannerView = ({
  plan, onReset, loading, loadingStartTime, onGenerate, planType, setPlanType,
  mode, setMode, profile, setProfile, onViewRecipe,
  batchConfig, setBatchConfig, onLogout, onAddMissingToShoppingList, onAlert
}: PlannerProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [lunchAlt, setLunchAlt] = useState(false);
  const [dinnerAlt, setDinnerAlt] = useState(false);

  const renderRecipeCard = (title: string, r: any, isAlt: boolean, toggleAlt: () => void, delayIndex: number) => {
    if (!r) return null;
    return (
      <div
        className="bg-white p-7 rounded-[2.5rem] border-2 border-stone-100 shadow-sm mb-6 relative overflow-hidden group hover:shadow-xl transition-all duration-300 animate-fade-slide"
        style={{ animationDelay: `${delayIndex * 100}ms` }}
      >
        <div className="flex justify-between items-center mb-6">
          <span className="text-[10px] font-black text-stone-300 uppercase tracking-[0.2em]">{title}</span>
          <button
            onClick={toggleAlt}
            className="text-[10px] font-black bg-stone-100 text-stone-500 px-4 py-2 rounded-full flex items-center gap-1.5 active:scale-95 hover:bg-stone-200 transition-colors"
          >
            <Repeat size={12}/> PLAN {isAlt ? 'B' : 'A'}
          </button>
        </div>
        <div onClick={() => onViewRecipe(r)} className="cursor-pointer">
          <h3 className="text-3xl font-black text-stone-800 leading-tight mb-4 group-hover:text-teal-600 transition-colors">{r.title || 'Receta Sorpresa'}</h3>
          <div className="flex gap-3 mb-5">
            <span className="text-xs font-bold text-stone-600 flex items-center gap-1 bg-[#FDFBF7] px-3 py-1.5 rounded-lg border border-stone-200">
              <Clock size={14} className="text-teal-500"/> {r.time || 'Rápido'}
            </span>
            <span className="text-xs font-black text-teal-700 bg-teal-100 px-3 py-1.5 rounded-lg">
              CERO SOBRAS: {r.wasteValue || 0}€
            </span>
          </div>
          <p className="text-sm text-stone-500 font-medium line-clamp-2 italic leading-relaxed">
            "{r.description || 'Haz click para descubrir la magia...'}"
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 pt-10 pb-32 animate-in fade-in bg-[#FDFBF7] min-h-full">
      <CustomStyles/>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black text-stone-800 tracking-tight">La Magia</h1>
      </div>

      {showSettings ? (
        <TribeSettings
          profile={profile}
          setProfile={setProfile}
          onClose={() => setShowSettings(false)}
          onLogout={onLogout}
          onAlert={onAlert}
        />
      ) : (
        <div
          onClick={() => setShowSettings(true)}
          className="bg-white border-2 border-stone-200 p-5 rounded-[2rem] mb-6 flex justify-between items-center shadow-sm cursor-pointer hover:border-teal-300 transition-colors group"
        >
          <div>
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Cocinando para:</p>
            <p className="text-sm text-stone-700 font-bold capitalize">
              {profile.people} pax • {profile.style} • {profile.robot || 'Sartén'}
            </p>
          </div>
          <div className="bg-stone-100 p-3 rounded-full group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
            <Settings2 size={20}/>
          </div>
        </div>
      )}

      {plan && !loading && (
        <button
          onClick={onReset}
          className="w-full mb-8 py-5 bg-rose-50 text-rose-500 font-black rounded-[1.5rem] border-2 border-rose-100 hover:bg-rose-100 transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-95"
        >
          <Trash2 size={18}/> Borrar Plan Actual
        </button>
      )}
      
      {!plan && !loading && !showSettings && (
        <div className="animate-in slide-in-from-bottom-8 duration-500">
          
          <div className="bg-stone-200/50 p-1.5 rounded-[1.5rem] flex mb-6">
            <button
              onClick={() => setPlanType('daily')}
              className={`flex-1 py-4 text-sm font-black rounded-[1.2rem] transition-all ${
                planType === 'daily' ? 'bg-white text-stone-900 shadow-md' : 'text-stone-500 hover:bg-stone-200/50'
              }`}
            >
              Solo Hoy
            </button>
            <button
              onClick={() => setPlanType('batch')}
              className={`flex-1 py-4 text-sm font-black rounded-[1.2rem] transition-all flex items-center justify-center gap-2 ${
                planType === 'batch' ? 'bg-white text-stone-900 shadow-md' : 'text-stone-500 hover:bg-stone-200/50'
              }`}
            >
              <CalendarDays size={18}/> Batch Cooking
            </button>
          </div>

          {planType === 'batch' && (
            <div className="bg-white p-6 rounded-[2rem] border-2 border-stone-100 mb-6 shadow-sm animate-in zoom-in-95 duration-300">
              <p className="font-black text-stone-800 mb-4 text-sm uppercase tracking-widest flex items-center gap-2">
                <CalendarDays size={16} className="text-orange-500"/> 1. ¿Cuántos días?
              </p>
              <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
                {[2, 3, 4, 5, 6, 7].map(d => (
                  <button
                    key={d}
                    onClick={() => setBatchConfig({ ...batchConfig, days: d })}
                    className={`w-14 h-14 rounded-2xl font-black text-xl flex-shrink-0 transition-all border-2 ${
                      batchConfig.days === d
                        ? 'bg-teal-500 text-white border-teal-500 shadow-md transform scale-110'
                        : 'bg-stone-50 border-stone-200 text-stone-500 hover:border-orange-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="font-black text-stone-800 mb-4 text-sm uppercase tracking-widest flex items-center gap-2">
                <Utensils size={16} className="text-teal-500"/> 2. ¿Qué comidas?
              </p>
              <div className="flex gap-3">
                {['lunch', 'dinner'].map((m: any) => (
                  <button
                    key={m}
                    onClick={() => {
                      const newMeals = batchConfig.meals.includes(m)
                        ? batchConfig.meals.filter((x: any) => x !== m)
                        : [...batchConfig.meals, m];
                      if (newMeals.length > 0) setBatchConfig({ ...batchConfig, meals: newMeals });
                    }}
                    className={`flex-1 py-4 rounded-2xl font-black capitalize border-2 transition-all ${
                      batchConfig.meals.includes(m)
                        ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                        : 'border-stone-200 bg-stone-50 text-stone-500'
                    }`}
                  >
                    {m === 'lunch' ? 'Comidas' : 'Cenas'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 mb-8">
            <button
              onClick={() => setMode('aprovechamiento')}
              className={`flex-1 py-5 text-xs font-black rounded-[1.5rem] border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                mode === 'aprovechamiento'
                  ? 'bg-teal-50 border-teal-300 text-teal-800 shadow-sm'
                  : 'bg-white border-stone-200 text-stone-400 hover:bg-stone-50'
              }`}
            >
              <Leaf size={24}/> CERO SOBRAS
            </button>
            <button
              onClick={() => setMode('chef')}
              className={`flex-1 py-5 text-xs font-black rounded-[1.5rem] border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                mode === 'chef'
                  ? 'bg-orange-50 border-orange-300 text-orange-800 shadow-sm'
                  : 'bg-white border-stone-200 text-stone-400 hover:bg-stone-50'
              }`}
            >
              <Sparkles size={24}/> MODO CHEF
            </button>
          </div>
          
          <button
            onClick={onGenerate}
            className="w-full bg-stone-900 text-white py-6 rounded-[2rem] font-black text-xl shadow-xl active:scale-95 transition-all mt-2 hover:bg-black flex items-center justify-center gap-3 overflow-hidden group"
          >
            <ChefHat size={24} className="group-hover:animate-wiggle"/> 
            <span className="relative z-10">¡CREAR MAGIA!</span>
            <div className="animate-shimmer absolute inset-0 opacity-20"></div>
          </button>
        </div>
      )}

      {loading && <PsychologicalLoader startTime={loadingStartTime} />}

      {plan && !loading && (
        <div className="space-y-6 animate-in slide-in-from-bottom-8">
          
          {plan.shopping_list && plan.shopping_list.length > 0 && (
            <div className="bg-orange-50 p-6 rounded-[2rem] border-2 border-orange-200 shadow-sm flex flex-col items-center text-center animate-fade-slide">
              <ShoppingBag className="text-orange-500 mb-3" size={32}/>
              <h3 className="font-black text-orange-900 text-lg mb-2">Faltan {plan.shopping_list.length} ingredientes</h3>
              <p className="text-sm text-orange-700 font-medium mb-4">La IA ha detectado que necesitas cosas de la tienda para este menú.</p>
              <button
                onClick={() => onAddMissingToShoppingList(plan.shopping_list || [])}
                className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-[1.5rem] shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Plus size={18}/> Añadir a la Compra
              </button>
            </div>
          )}

          {plan.type === 'batch' ? (
            <>
              <h3 className="text-2xl font-black text-stone-800 mb-6 px-2 flex items-center gap-2 animate-fade-slide" style={{ animationDelay: '100ms' }}>
                <Utensils className="text-teal-500"/> Menú Resultante
              </h3>
              <div className="space-y-6 mb-10">
                {plan.days?.map((day: any, idx: number) => (
                  <div
                    key={day.day}
                    className="bg-white p-6 rounded-[2rem] border-2 border-stone-100 shadow-sm hover:shadow-md transition-shadow animate-fade-slide"
                    style={{ animationDelay: `${(idx + 2) * 100}ms` }}
                  >
                    <div className="flex items-center gap-2 mb-5">
                      <span className="bg-stone-900 text-white px-4 py-1.5 rounded-xl font-black text-sm shadow-md">Día {day.day}</span>
                    </div>
                    <div className="space-y-3">
                      {day.lunch && (
                        <div
                          onClick={() => onViewRecipe(day.lunch)}
                          className="p-5 bg-stone-50 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-teal-50 transition-colors border-2 border-stone-100 hover:border-teal-200 group"
                        >
                          <div className="pr-4">
                            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-1">Comida</span>
                            <h4 className="font-black text-stone-800 text-lg leading-tight group-hover:text-teal-700 transition-colors">{day.lunch.title}</h4>
                          </div>
                          <div className="bg-white p-2 rounded-full shadow-sm group-hover:bg-teal-100 transition-colors">
                            <ChevronRight size={20} className="text-stone-400 group-hover:text-teal-600"/>
                          </div>
                        </div>
                      )}
                      {day.dinner && (
                        <div
                          onClick={() => onViewRecipe(day.dinner)}
                          className="p-5 bg-stone-50 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-teal-50 transition-colors border-2 border-stone-100 hover:border-teal-200 group"
                        >
                          <div className="pr-4">
                            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-1">Cena</span>
                            <h4 className="font-black text-stone-800 text-lg leading-tight group-hover:text-teal-700 transition-colors">{day.dinner.title}</h4>
                          </div>
                          <div className="bg-white p-2 rounded-full shadow-sm group-hover:bg-teal-100 transition-colors">
                            <ChevronRight size={20} className="text-stone-400 group-hover:text-teal-600"/>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border-2 border-stone-100 shadow-lg mb-8 animate-fade-slide" style={{ animationDelay: '500ms' }}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-orange-100 p-3 rounded-2xl"><ListChecks className="text-orange-500" size={28}/></div>
                  <h2 className="text-2xl font-black text-stone-900">Plan de Ataque</h2>
                </div>
                <p className="text-stone-600 font-medium mb-8 leading-relaxed italic border-l-4 border-orange-300 pl-4 bg-orange-50/50 py-2 rounded-r-xl">
                  {plan.batch_masterclass?.intro || "¡Vamos a cocinar todo de golpe para descansar el resto de la semana!"}
                </p>
                
                <div className="space-y-6">
                  {plan.batch_masterclass?.step_by_step?.map((phase: any, idx: number) => (
                    <div key={idx} className="bg-stone-50 p-6 rounded-2xl border-2 border-stone-200 shadow-sm">
                      <h4 className="font-black text-stone-800 text-lg mb-4 flex items-center gap-2">
                        <ChefHat size={20} className="text-teal-500"/> {phase.phase}
                      </h4>
                      <ul className="space-y-3">
                        {phase.tasks.map((t: string, i: number) => (
                          <li key={i} className="flex items-start gap-3 bg-white p-3 rounded-xl border border-stone-100 shadow-sm">
                            <div className="mt-1.5 w-2 h-2 bg-stone-800 rounded-full shrink-0"></div>
                            <span className="text-sm font-medium text-stone-700 leading-snug">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="mt-8 bg-teal-50 p-6 rounded-2xl border-2 border-teal-100 shadow-sm">
                  <h4 className="font-black text-teal-900 text-lg mb-4 flex items-center gap-2">
                    <ThermometerSnowflake size={20}/> Organización de Tuppers
                  </h4>
                  <ul className="space-y-3">
                    {(plan.batch_masterclass?.storage_tips || []).map((tip: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 bg-white p-3 rounded-xl shadow-sm border border-teal-50">
                        <div className="mt-1.5 w-2 h-2 bg-teal-500 rounded-full shrink-0"></div>
                        <span className="text-sm font-bold text-teal-800 leading-snug">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              {renderRecipeCard("Almuerzo", lunchAlt ? plan.lunch_alt : plan.lunch, lunchAlt, () => setLunchAlt(!lunchAlt), 1)}
              {renderRecipeCard("Cena", dinnerAlt ? plan.dinner_alt : plan.dinner, dinnerAlt, () => setDinnerAlt(!dinnerAlt), 2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface RecipeDetailProps { recipe: Recipe; onBack: () => void; onCooked: () => void; }
const RecipeDetail = ({ recipe, onBack, onCooked }: RecipeDetailProps) => {
  const safeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const safeSteps = Array.isArray(recipe?.steps) ? recipe.steps : [];

  useEffect(() => {
    if (POSTHOG_KEY) posthog.capture('recipe_viewed', { title: recipe?.title });
  }, [recipe]);

  return (
    <div className="p-6 pt-10 pb-32 bg-[#FDFBF7] min-h-screen animate-in slide-in-from-right duration-300 relative z-50">
      <button onClick={onBack} className="mb-8 bg-white p-4 rounded-full shadow-md border-2 border-stone-100 hover:bg-stone-50 transition-colors active:scale-90">
        <ArrowLeft size={24} className="text-stone-600"/>
      </button>
      
      <h1 className="text-4xl font-black mb-6 leading-tight text-stone-900 tracking-tighter">{recipe?.title}</h1>
      
      <div className="flex flex-wrap gap-3 mb-10">
        <span className="bg-white border-2 border-stone-100 px-4 py-2 rounded-[1rem] font-bold text-sm flex items-center gap-2 text-stone-700 shadow-sm">
          <Clock size={16} className="text-teal-500"/> {recipe?.time || '30m'}
        </span>
        <span className="bg-white border-2 border-stone-100 px-4 py-2 rounded-[1rem] font-bold text-sm flex items-center gap-2 text-stone-700 shadow-sm">
          <Flame size={16} className="text-orange-500"/> {recipe?.calories || 0} kcal
        </span>
        <span className="bg-teal-50 border-2 border-teal-100 px-4 py-2 rounded-[1rem] font-black text-sm flex items-center gap-2 text-teal-700 shadow-sm">
          <Leaf size={16}/> Salvas {recipe?.wasteValue || 0}€
        </span>
      </div>
      
      <div className="mb-10 bg-white p-6 rounded-[2rem] border-2 border-stone-100 shadow-sm animate-fade-slide">
        <h3 className="font-black text-2xl mb-6 flex items-center gap-2 text-stone-800">
          <Scale className="text-orange-500"/> Ingredientes
        </h3>
        <div className="space-y-3">
          {safeIngredients.map((ing: any, i: number) => (
            <div key={i} className="p-4 bg-[#FDFBF7] rounded-xl font-bold text-sm border border-stone-200 flex items-start gap-3">
              <div className="w-2.5 h-2.5 mt-1 rounded-full bg-teal-500 shrink-0"></div>
              <span className="text-stone-700 leading-snug">
                <FormattedText text={typeof ing === 'string' ? ing : (ing.name || '')} />
              </span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="mb-12 bg-white p-6 rounded-[2rem] border-2 border-stone-100 shadow-sm animate-fade-slide" style={{ animationDelay: '100ms' }}>
        <h3 className="font-black text-2xl mb-6 flex items-center gap-2 text-stone-800">
          <ChefHat className="text-teal-500"/> Elaboración
        </h3>
        <div className="space-y-8">
          {safeSteps.map((step: any, i: number) => (
            <div key={i} className="flex gap-5 relative group">
              {i < safeSteps.length - 1 && (
                <div className="absolute left-[1.1rem] top-12 bottom-[-2rem] w-[3px] bg-stone-100 rounded-full group-hover:bg-teal-100 transition-colors"></div>
              )}
              <div className="shrink-0 w-10 h-10 bg-teal-50 text-teal-600 border-2 border-teal-200 rounded-[1.2rem] flex items-center justify-center text-lg font-black z-10 shadow-sm">
                {i + 1}
              </div>
              <p className="font-medium text-stone-600 pt-1.5 leading-relaxed text-[15px]">
                <FormattedText text={step} />
              </p>
            </div>
          ))}
        </div>
      </div>
      
      <button
        onClick={onCooked}
        className="w-full py-6 bg-stone-900 text-white rounded-[2rem] font-black text-xl shadow-xl hover:bg-black active:scale-95 transition-all flex justify-center gap-3 items-center border-4 border-stone-800 animate-fade-slide"
        style={{ animationDelay: '200ms' }}
      >
        <CheckCircle2 size={28}/> ¡PLATO TERMINADO!
      </button>
    </div>
  );
};

// 🚀 REFACTORIZADO EL COPYWRITING (Para tontos y cero fricción)
interface ConsumptionModalProps { recipe: Recipe; ingredients: Ingredient[]; onConfirm: (c: string[]) => void; onClose: () => void; }
const ConsumptionModal = ({ recipe, ingredients, onConfirm, onClose }: ConsumptionModalProps) => {
  const safeRecIngs = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const relevant = useMemo(() => {
    const match = ingredients.filter((ing: any) =>
      safeRecIngs.some((ri: any) =>
        (typeof ri === 'string' ? ri : (ri.name || '')).toLowerCase().includes(ing.name.toLowerCase())
      )
    );
    return match.length > 0 ? match : ingredients;
  }, [recipe, ingredients]);

  const [selected, setSelected] = useState<string[]>(relevant.map((i: any) => i.id));
  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm flex items-end justify-center p-4 z-[100] animate-in fade-in">
      <div className="bg-[#FDFBF7] w-full max-w-md rounded-[3rem] p-8 shadow-2xl animate-in slide-in-from-bottom-8 border-t-8 border-white">
        <div className="w-16 h-1.5 bg-stone-200 rounded-full mx-auto mb-8"></div>
        <div className="flex justify-center mb-6"><PartyPopper size={48} className="text-orange-500 animate-wiggle"/></div>
        
        {/* TEXTOS CLAROS Y DIRECTOS */}
        <h2 className="text-3xl font-black mb-2 text-center text-stone-900 tracking-tight">¡Magia completada!</h2>
        <p className="text-center text-stone-500 mb-8 font-medium text-base px-2">
          Has ahorrado <b className="text-teal-600">{recipe?.wasteValue || 0}€</b>. Marca abajo lo que ya no te queda en la nevera para que lo borremos automáticamente:
        </p>
        
        <div className="space-y-3 mb-10 max-h-64 overflow-y-auto no-scrollbar pb-4 px-2">
          {relevant.map((ing: any) => (
            <div
              key={ing.id}
              onClick={() => toggle(ing.id)}
              className={`flex items-center gap-4 p-5 rounded-[1.5rem] border-2 transition-all cursor-pointer ${
                selected.includes(ing.id)
                  ? 'bg-white border-teal-400 shadow-md transform scale-[1.02]'
                  : 'bg-stone-50 border-stone-200 opacity-60'
              }`}
            >
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                selected.includes(ing.id) ? 'bg-teal-500 border-teal-500' : 'border-stone-300 bg-white'
              }`}>
                {selected.includes(ing.id) && <Check size={16} className="text-white" strokeWidth={3}/>}
              </div>
              <span className={`font-black text-lg ${selected.includes(ing.id) ? 'text-stone-800' : 'text-stone-400'}`}>{ing.name}</span>
            </div>
          ))}
        </div>
        
        <div className="flex gap-4">
          <button onClick={onClose} className="flex-1 py-5 bg-stone-200 rounded-[1.5rem] font-black text-stone-600 hover:bg-stone-300 transition-colors active:scale-95 text-sm uppercase tracking-widest">
            Atrás
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="flex-[2] py-5 bg-[#5CB82C] text-white rounded-[1.5rem] font-black shadow-lg active:scale-95 transition-transform text-sm uppercase tracking-widest flex items-center justify-center gap-2"
          >
            {/* BOTÓN SUPER CLARO */}
            <Save size={18}/> Guardar en Recetario
          </button>
        </div>
      </div>
    </div>
  );
};

// --- 8. MAIN APP ---
export default function App() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [alertMessage, setAlertMessage] = useState(''); 
  
  // 🚀 ESTADO PARA EL COMPONENTE CUSTOM CONFIRM
  const [confirmAction, setConfirmAction] = useState<{ message: string, onConfirm: () => void } | null>(null);
  
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const s = localStorage.getItem('platoplan_profile');
      if (s) {
        const p = JSON.parse(s);
        if (typeof p.allergies === 'string') p.allergies = [p.allergies];
        if (!Array.isArray(p.allergies)) p.allergies = [];
        if (!p.style) p.style = "Clásica";
        return p;
      }
    } catch (e) {}
    return { name: 'Chef', style: 'Clásica', allergies: [], people: 2, ages: '', robot: '' };
  });
  
  const [view, setView] = useState<ViewState>(() => {
    return (localStorage.getItem('platoplan_current_view') as ViewState) || 'auth';
  });

  const [savings, setSavings] = useState(() => parseFloat(localStorage.getItem('platoplan_savings') || '0'));
  const [wasteSaved, setWasteSaved] = useState(() => parseFloat(localStorage.getItem('platoplan_waste') || '0'));
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => {
    try { return JSON.parse(localStorage.getItem('platoplan_pantry') || '[]'); } catch (e) { return []; }
  });
  const [history, setHistory] = useState<Recipe[]>(() => {
    try { return JSON.parse(localStorage.getItem('platoplan_history') || '[]'); } catch (e) { return []; }
  });
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('platoplan_list') || '[]'); } catch (e) { return []; }
  });
  
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(() => {
    try { return JSON.parse(localStorage.getItem('platoplan_selected_recipe') || 'null'); } catch(e) { return null; }
  });
  const [plan, setPlan] = useState<MealPlan | null>(() => {
    try { return JSON.parse(localStorage.getItem('platoplan_current_plan') || 'null'); } catch(e) { return null; }
  });
  
  const [loading, setLoading] = useState(false);
  const [loadingStartTime, setLoadingStartTime] = useState(0); 
  const [globalLoading, setGlobalLoading] = useState(true);
  const [mode, setMode] = useState<'aprovechamiento' | 'chef'>('aprovechamiento');
  const [planType, setPlanType] = useState<'daily' | 'batch'>('daily');
  const [batchConfig, setBatchConfig] = useState<BatchConfig>({ days: 3, meals: ['lunch', 'dinner'] });
  const [showConfirm, setShowConfirm] = useState(false);

  const navigateTo = useCallback((newView: ViewState) => {
    localStorage.setItem('platoplan_current_view', newView);
    setView(newView);
    window.history.pushState({ view: newView }, '');
  }, []);

  useEffect(() => {
    window.history.replaceState({ view }, '');
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
        localStorage.setItem('platoplan_current_view', event.state.view);
      } else {
        setView('dashboard');
        localStorage.setItem('platoplan_current_view', 'dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadCloudData(session.user.id);
      } else {
        setGlobalLoading(false);
        navigateTo('auth');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadCloudData(session.user.id);
      } else {
        navigateTo('auth');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadCloudData = async (uid: string) => {
    const localProfileStr = localStorage.getItem('platoplan_profile');
    if (localProfileStr) {
      const localProfile = JSON.parse(localProfileStr);
      setProfile(localProfile);
      const currentStoredView = localStorage.getItem('platoplan_current_view') as ViewState;
      if (!currentStoredView || currentStoredView === 'auth') {
         navigateTo('dashboard');
      } else {
         navigateTo(currentStoredView);
      }
      setGlobalLoading(false); 
    } else {
      setGlobalLoading(true);
    }

    try {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).single();
      const { data: i } = await supabase.from('pantry').select('*').eq('user_id', uid);
      const { data: h } = await supabase.from('history').select('*').eq('user_id', uid);
      const { data: l } = await supabase.from('shopping_list').select('*').eq('user_id', uid);
      
      if (p) {
        let safeAlg = p.allergies;
        if (typeof safeAlg === 'string') safeAlg = [safeAlg];
        if (!Array.isArray(safeAlg)) safeAlg = [];
        setProfile({ ...p, allergies: safeAlg });
        setSavings(p.savings || 0);
        setWasteSaved(p.waste_saved || 0);
        if (!localProfileStr) navigateTo('dashboard');
      } else if (localProfileStr) {
        const localProfile = JSON.parse(localProfileStr);
        await supabase.from('profiles').upsert({
          id: uid,
          name: localProfile.name,
          style: localProfile.style,
          allergies: localProfile.allergies,
          people: localProfile.people,
          ages: localProfile.ages,
          robot: localProfile.robot
        });
      } else {
        navigateTo('onboarding');
      }

      if (i && i.length > 0) setIngredients(i.map((x: any) => ({ ...x, expiryStatus: x.expiry_status })));
      if (h && h.length > 0) setHistory(h.map((x: any) => ({ ...x.recipe_data, date: x.date })));
      if (l && l.length > 0) setShoppingList(l);
      
      if (POSTHOG_KEY && typeof posthog !== 'undefined' && posthog.identify) {
        posthog.identify(uid, { email: user?.email });
      }
      if (isOneSignalInitialized && typeof OneSignal !== 'undefined') {
        OneSignal.setExternalUserId(uid);
      }
      
    } catch (err) {
      console.error("Sincronización en segundo plano falló:", err);
    }
    setGlobalLoading(false);
  };

  const saveProfileCloud = useCallback(async (p: UserProfile) => {
    setProfile(p);
    localStorage.setItem('platoplan_profile', JSON.stringify(p));
    if (user) {
      await supabase.from('profiles').upsert({
        id: user.id,
        name: p.name,
        style: p.style,
        allergies: p.allergies,
        people: p.people,
        ages: p.ages,
        robot: p.robot
      });
    }
    if (POSTHOG_KEY) posthog.capture('profile_updated', { style: p.style, people: p.people });
  }, [user]);

  const updatePantry = useCallback(async (newIngs: Ingredient[]) => {
    setIngredients(newIngs);
    localStorage.setItem('platoplan_pantry', JSON.stringify(newIngs));
    if (user) {
      await supabase.from('pantry').delete().eq('user_id', user.id);
      if (newIngs.length > 0) {
        await supabase.from('pantry').insert(
          newIngs.map(x => ({
            user_id: user.id,
            id: x.id,
            name: x.name,
            quantity: x.quantity,
            expiry_status: x.expiryStatus,
            category: x.category
          }))
        );
      }
    }
  }, [user]);

  const updateList = useCallback(async (newList: ShoppingItem[]) => {
    setShoppingList(newList);
    localStorage.setItem('platoplan_list', JSON.stringify(newList));
    if (user) {
      await supabase.from('shopping_list').delete().eq('user_id', user.id);
      if (newList.length > 0) {
        await supabase.from('shopping_list').insert(
          newList.map(x => ({
            user_id: user.id,
            id: x.id,
            name: x.name,
            checked: x.checked
          }))
        );
      }
    }
  }, [user]);

  // 🚀 LÓGICA DE BORRADO DE RECETAS INDIVIDUALES
  const handleDeleteRecipe = useCallback((recipeToDelete: Recipe) => {
    setConfirmAction({
      message: `¿Quieres borrar "${recipeToDelete.title}" de tu recetario?`,
      onConfirm: async () => {
        const newHistory = history.filter(h => h.title !== recipeToDelete.title);
        setHistory(newHistory);
        localStorage.setItem('platoplan_history', JSON.stringify(newHistory));
        if (user) {
          await supabase.from('history').delete().eq('user_id', user.id).eq('title', recipeToDelete.title);
        }
        setConfirmAction(null);
      }
    });
  }, [history, user]);

  // 🚀 LÓGICA DE BORRADO TOTAL (SIN ALERT NATIVO)
  const handleClearHistory = useCallback(() => {
    setConfirmAction({
      message: "¿Seguro que quieres borrar TODAS tus recetas? Tu recetario quedará vacío.",
      onConfirm: async () => {
        setHistory([]);
        localStorage.setItem('platoplan_history', '[]');
        if (user) await supabase.from('history').delete().eq('user_id', user.id);
        if (POSTHOG_KEY) posthog.capture('history_cleared');
        setConfirmAction(null);
      }
    });
  }, [user]);

  const generate = useCallback(async () => {
    if (!GEMINI_API_KEY) return setAlertMessage("Falta configurar la clave de la IA. Tu cocina no tiene magia ahora mismo.");
    if (ingredients.length === 0) return setAlertMessage("¡Tu nevera está vacía! Añade algún ingrediente primero.");
    
    setLoading(true);
    setLoadingStartTime(Date.now()); 
    
    const data = await generateRealPlan(GEMINI_API_KEY, ingredients, profile, mode, planType, batchConfig, setAlertMessage);
    if (data) {
      setPlan(data);
      localStorage.setItem('platoplan_current_plan', JSON.stringify(data));
    } else {
      setAlertMessage("Vaya, la cocina está revolucionada. Inténtalo de nuevo en un momentito.");
    }
    setLoading(false);
  }, [ingredients, profile, mode, planType, batchConfig]);

  const handleCookDone = useCallback(async (consumed: string[]) => {
    if (selectedRecipe) {
      const newSavings = savings + Math.max(0, (15 * profile.people) - (selectedRecipe.priceEstimate || 0));
      const newWaste = wasteSaved + (selectedRecipe.wasteValue || 0);
      
      // Añadimos al recetario solo si no estaba ya (evitar duplicados al recocinar)
      const isAlreadyInHistory = history.some(h => h.title === selectedRecipe.title);
      let newHistory = history;
      
      if (!isAlreadyInHistory) {
        newHistory = [{ ...selectedRecipe, date: new Date().toLocaleDateString() }, ...history];
        setHistory(newHistory);
        localStorage.setItem('platoplan_history', JSON.stringify(newHistory));
        
        if (user) {
          await supabase.from('history').insert({
            user_id: user.id,
            title: selectedRecipe.title,
            calories: selectedRecipe.calories,
            waste_value: selectedRecipe.wasteValue,
            date: new Date().toLocaleDateString(),
            recipe_data: selectedRecipe
          });
        }
      }
      
      setSavings(newSavings);
      setWasteSaved(newWaste);
      localStorage.setItem('platoplan_savings', newSavings.toString());
      localStorage.setItem('platoplan_waste', newWaste.toString());
      if (user) await supabase.from('profiles').update({ savings: newSavings, waste_saved: newWaste }).eq('id', user.id);
      
      updatePantry(ingredients.filter(i => !consumed.includes(i.id)));
      if (POSTHOG_KEY) posthog.capture('recipe_cooked', { recipe_title: selectedRecipe.title, waste_saved: selectedRecipe.wasteValue });
      
      setShowConfirm(false);
      setSelectedRecipe(null);
      localStorage.removeItem('platoplan_selected_recipe');
      navigateTo('history'); // Al guardar, los mandamos al Recetario para que vean su "Logro"
    }
  }, [selectedRecipe, savings, wasteSaved, history, ingredients, profile, user, updatePantry, navigateTo]);

  const handleAddMissingToShoppingList = useCallback((missingItems: string[]) => {
    if (!missingItems || missingItems.length === 0) return;
    
    let updatedList = [...shoppingList];

    const parseItem = (str: string) => {
        const match = str.trim().match(/^([\d.,]+)\s*([a-zA-Z]+)?\s+(de\s+)?(.*)$/i);
        if (match) {
            return {
                amount: parseFloat(match[1].replace(',', '.')),
                unit: (match[2] || '').toLowerCase(),
                name: match[4].toLowerCase().trim(),
                originalName: match[4].trim(),
            };
        }
        return { amount: 0, unit: '', name: str.toLowerCase().trim(), originalName: str.trim() };
    };

    missingItems.forEach(newItemStr => {
        const newItem = parseItem(newItemStr);
        let foundIndex = -1;

        for (let i = 0; i < updatedList.length; i++) {
            const existingItem = parseItem(updatedList[i].name);
            if (existingItem.name === newItem.name || existingItem.name.includes(newItem.name) || newItem.name.includes(existingItem.name)) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex !== -1) {
            const existingItem = parseItem(updatedList[foundIndex].name);

            if (existingItem.amount > 0 && newItem.amount > 0 && existingItem.unit === newItem.unit) {
                const total = existingItem.amount + newItem.amount;
                updatedList[foundIndex] = {
                    ...updatedList[foundIndex],
                    name: `${total} ${newItem.unit} ${newItem.originalName}`,
                    checked: false 
                };
            } else if (existingItem.amount === 0 && newItem.amount > 0) {
                 updatedList[foundIndex] = {
                    ...updatedList[foundIndex],
                    name: `${newItem.amount} ${newItem.unit} ${newItem.originalName}`,
                    checked: false
                };
            } else {
                 updatedList.unshift({
                    id: Date.now().toString() + Math.random().toString(),
                    name: newItemStr,
                    checked: false
                 });
            }
        } else {
            updatedList.unshift({
                id: Date.now().toString() + Math.random().toString(),
                name: newItemStr,
                checked: false
            });
        }
    });
    
    updateList(updatedList);
    setAlertMessage("¡Ingredientes añadidos y fusionados en tu lista de la compra!");
    if (plan) {
      const newPlan = { ...plan, shopping_list: [] };
      setPlan(newPlan);
      localStorage.setItem('platoplan_current_plan', JSON.stringify(newPlan));
    }
    if (POSTHOG_KEY) posthog.capture('missing_added_to_shopping', { count: missingItems.length });
  }, [shoppingList, updateList, plan]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    if (POSTHOG_KEY) posthog.reset();
    if (isOneSignalInitialized) OneSignal.removeExternalUserId();
    window.location.reload();
  }, []);

  if (globalLoading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-teal-500 mb-4"/>
        <p className="font-bold text-stone-500">Cargando tu cocina...</p>
      </div>
    );
  }

  if (view === 'auth') return <AuthView onAlert={setAlertMessage} />;
  if (view === 'onboarding') return (
    <OnboardingView
      profile={profile}
      setProfile={setProfile}
      onComplete={() => { saveProfileCloud(profile); navigateTo('dashboard'); }}
    />
  );

  return (
    <div className="h-[100dvh] bg-[#FDFBF7] flex flex-col font-sans max-w-md mx-auto shadow-2xl relative overflow-hidden text-stone-800 selection:bg-teal-200">
      
      {/* ALERTAS Y CONFIRMACIONES PREMIUM */}
      <CustomAlert message={alertMessage} onClose={() => setAlertMessage('')} />
      {confirmAction && (
        <CustomConfirm 
          message={confirmAction.message} 
          onConfirm={confirmAction.onConfirm} 
          onCancel={() => setConfirmAction(null)} 
        />
      )}

      <main className="flex-1 overflow-y-auto no-scrollbar pb-28 scroll-smooth">
        {view === 'dashboard' && (
          <DashboardView
            savings={savings}
            wasteSaved={wasteSaved}
            totalItems={ingredients.length}
            profileName={profile.name}
          />
        )}
        {view === 'pantry' && (
          <PantryView ingredients={ingredients} setIngredients={updatePantry} />
        )}
        {view === 'shopping' && (
          <ShoppingView list={shoppingList} setList={updateList} onAlert={setAlertMessage} />
        )}
        {view === 'history' && (
          <HistoryView 
            history={history} 
            onDeleteAll={handleClearHistory}
            onDeleteRecipe={handleDeleteRecipe} 
            onViewRecipe={(r: Recipe) => { 
              setSelectedRecipe(r); 
              localStorage.setItem('platoplan_selected_recipe', JSON.stringify(r));
              navigateTo('recipe-detail'); 
            }} 
          />
        )}
        {view === 'planner' && (
          <PlannerView
            plan={plan}
            onReset={() => {
              setPlan(null);
              localStorage.removeItem('platoplan_current_plan'); 
            }}
            loading={loading}
            loadingStartTime={loadingStartTime}
            onGenerate={generate}
            planType={planType}
            setPlanType={setPlanType}
            batchConfig={batchConfig}
            setBatchConfig={setBatchConfig}
            mode={mode}
            setMode={setMode}
            profile={profile}
            setProfile={saveProfileCloud}
            onLogout={handleLogout}
            onViewRecipe={(r: Recipe) => { 
              setSelectedRecipe(r); 
              localStorage.setItem('platoplan_selected_recipe', JSON.stringify(r));
              navigateTo('recipe-detail'); 
            }}
            onAddMissingToShoppingList={handleAddMissingToShoppingList}
            onAlert={setAlertMessage}
          />
        )}
        {view === 'recipe-detail' && selectedRecipe && (
          <RecipeDetail
            recipe={selectedRecipe}
            onBack={() => {
              localStorage.removeItem('platoplan_selected_recipe');
              const prevView = history.some(h => h.title === selectedRecipe.title) ? 'history' : 'planner';
              navigateTo(prevView);
            }} 
            onCooked={() => setShowConfirm(true)}
          />
        )}
      </main>

      {showConfirm && selectedRecipe && (
        <ConsumptionModal
          recipe={selectedRecipe}
          ingredients={ingredients}
          onConfirm={handleCookDone}
          onClose={() => setShowConfirm(false)}
        />
      )}

      {view !== 'recipe-detail' && (
        <div
          className="bg-white/95 backdrop-blur-xl border-t border-stone-100 px-4 py-3 flex justify-between items-center z-50 fixed bottom-0 left-0 right-0 max-w-md mx-auto shadow-[0_-10px_40px_rgba(0,0,0,0.03)]"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => navigateTo('dashboard')}
            className={`flex flex-col items-center gap-1.5 transition-all ${
              view === 'dashboard' ? 'text-[#5CB82C] scale-105' : 'text-stone-300 hover:text-stone-500'
            }`}
          >
            <TrendingUp size={26} strokeWidth={view === 'dashboard' ? 3 : 2.5}/>
            <span className="text-[10px] font-black uppercase tracking-wider">Panel</span>
          </button>
          <button
            onClick={() => navigateTo('pantry')}
            className={`flex flex-col items-center gap-1.5 transition-all ${
              view === 'pantry' ? 'text-[#5CB82C] scale-105' : 'text-stone-300 hover:text-stone-500'
            }`}
          >
            <LayoutGrid size={26} strokeWidth={view === 'pantry' ? 3 : 2.5}/>
            <span className="text-[10px] font-black uppercase tracking-wider">Nevera</span>
          </button>
          <button
            onClick={() => navigateTo('planner')}
            className={`flex flex-col items-center gap-1.5 transition-all ${
              view === 'planner' ? 'text-[#5CB82C] scale-105' : 'text-stone-300 hover:text-stone-500'
            }`}
          >
            <ChefHat size={26} strokeWidth={view === 'planner' ? 3 : 2.5}/>
            <span className="text-[10px] font-black uppercase tracking-wider">Magia</span>
          </button>
          <button
            onClick={() => navigateTo('shopping')}
            className={`flex flex-col items-center gap-1.5 transition-all ${
              view === 'shopping' ? 'text-[#5CB82C] scale-105' : 'text-stone-300 hover:text-stone-500'
            }`}
          >
            <ShoppingCart size={26} strokeWidth={view === 'shopping' ? 3 : 2.5}/>
            <span className="text-[10px] font-black uppercase tracking-wider">Compra</span>
          </button>
          <button
            onClick={() => navigateTo('history')}
            className={`flex flex-col items-center gap-1.5 transition-all ${
              view === 'history' ? 'text-[#5CB82C] scale-105' : 'text-stone-300 hover:text-stone-500'
            }`}
          >
            <BookOpen size={26} strokeWidth={view === 'history' ? 3 : 2.5}/>
            <span className="text-[10px] font-black uppercase tracking-wider">Recetario</span>
          </button>
        </div>
      )}
    </div>
  );
}