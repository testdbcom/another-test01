import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';

// ==========================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "",
      authDomain: "mock-tow-truck.firebaseapp.com",
      projectId: "mock-tow-truck",
      storageBucket: "mock-tow-truck.appspot.com",
      messagingSenderId: "1234567890",
      appId: "1:1234567890:web:abc123xyz"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'tow-truck-app-lao';

// ==========================================
// MOCK DATA TO POPULATE IF DATABASE IS EMPTY
// ==========================================
const INITIAL_TRUCKS = [
  {
    name: "ລົດລາກຂະໜາດນ້ອຍ (Small Tow Flatbed)",
    type: "small",
    price: 150000,
    driverName: "ທ້າວ ສົມພອນ ສີວິໄລ",
    driverPhone: "020 55443322",
    suitability: "ເໝາະສຳລັບລົດເກັງ, ລົດຈັກ ແລະ ລົດ SUV ຂະໜາດນ້ອຍ",
    imageUrl: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=600",
    status: "ว่าง"
  },
  {
    name: "ລົດຍົກຂະໜາດກາງ (Medium Wheel Lift)",
    type: "medium",
    price: 250000,
    driverName: "ທ້າວ ບຸນມີ ແກ້ວມະນີ",
    driverPhone: "020 99887766",
    suitability: "ເໝາະສຳລັບລົດກະບະ (Pickup) ແລະ ລົດຕູ້ຂະໜາດກາງ",
    imageUrl: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&q=80&w=600",
    status: "ว่าง"
  },
  {
    name: "ເຄນຍົກຂະໜາດໃຫຍ່ (Heavy Duty Crane Truck)",
    type: "heavy",
    price: 500000,
    driverName: "ທ້າວ ຄຳໄສ ສີປະເສີດ",
    driverPhone: "020 22334455",
    suitability: "ເໝາະສຳລັບລົດບັນທຸກ, ລົດເມ ແລະ ອຸປະຕິເຫດຮ້າຍແຮງທີ່ຕົກຮ່ອງ",
    imageUrl: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&q=80&w=600",
    status: "ว่าง"
  }
];

export default function App() {
  // Authentication & System States
  const [user, setUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('customer'); // 'customer' | 'admin'
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  
  // Data States
  const [trucks, setTrucks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Customer Form / Cart States
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [carConditionImg, setCarConditionImg] = useState('');
  const [damageDesc, setDamageDesc] = useState('');
  const [gpsLocation, setGpsLocation] = useState({ lat: 17.9757, lng: 102.6331 }); // Default to Vientiane
  const [detectingGps, setDetectingGps] = useState(false);
  const [bookingStatus, setBookingStatus] = useState(null); // 'submitting' | 'success' | 'error'
  const [activeBookingId, setActiveBookingId] = useState(null);

  // Admin CRUD Form States
  const [isEditingTruck, setIsEditingTruck] = useState(false);
  const [truckFormId, setTruckFormId] = useState(null); // null means new
  const [truckForm, setTruckForm] = useState({
    name: '',
    type: 'small',
    price: '',
    driverName: '',
    driverPhone: '',
    suitability: '',
    imageUrl: '',
    status: 'ว่าง'
  });

  // UI Toast Notification
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Camera simulation
  const fileInputRef = useRef(null);

  // 1. Authentication Lifecycle
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Firebase auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Database synchronization when User is authenticated
  useEffect(() => {
    if (!user) return;

    setLoading(true);

    // Setup Trucks collection subscription (RULE 1: Strict Paths)
    const trucksColRef = collection(db, 'artifacts', appId, 'public', 'data', 'trucks');
    const unsubscribeTrucks = onSnapshot(trucksColRef, (snapshot) => {
      const trucksData = [];
      snapshot.forEach((doc) => {
        trucksData.push({ id: doc.id, ...doc.data() });
      });

      // If no trucks exist on first load, seed database with default ones
      if (trucksData.length === 0) {
        INITIAL_TRUCKS.forEach(async (t) => {
          await addDoc(trucksColRef, t);
        });
      } else {
        setTrucks(trucksData);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error reading trucks:", error);
      setLoading(false);
    });

    // Setup Orders collection subscription (RULE 1: Strict Paths)
    const ordersColRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubscribeOrders = onSnapshot(ordersColRef, (snapshot) => {
      const ordersData = [];
      snapshot.forEach((doc) => {
        ordersData.push({ id: doc.id, ...doc.data() });
      });
      // Sort in memory (RULE 2: No Complex Queries)
      ordersData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setOrders(ordersData);
    }, (error) => {
      console.error("Error reading orders:", error);
    });

    return () => {
      unsubscribeTrucks();
      unsubscribeOrders();
    };
  }, [user]);

  // Handle GPS detection
  const detectLocation = () => {
    setDetectingGps(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setGpsLocation(coords);
          setDetectingGps(false);
          showToast("ດຶງຂໍ້ມູນພິກັດ GPS ປະຈຸບັນສຳເລັດ!", "success");
        },
        (error) => {
          console.warn("Geolocation failed, using default Vientiane location.", error);
          // Set simulated randomized location around Vientiane for demonstration
          const randomLat = 17.9757 + (Math.random() - 0.5) * 0.05;
          const randomLng = 102.6331 + (Math.random() - 0.5) * 0.05;
          setGpsLocation({ lat: randomLat, lng: randomLng });
          setDetectingGps(false);
          showToast("ບໍ່ສາມາດເຂົ້າເຖິງ GPS ຈຶ່ງໃຊ້ລະບົບຈຳລອງພິກັດໃຫ້ແທນ", "warning");
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      showToast("ອຸປະກອນຂອງທ່ານບໍ່ຮອງຮັບ Geolocation API", "error");
      setDetectingGps(false);
    }
  };

  // Mock Camera Click / File upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCarConditionImg(reader.result); // Base64 string for preview
        showToast("ອັບໂຫຼດຮູບພາບສະພາບລົດສຳເລັດ", "success");
      };
      reader.readAsDataURL(file);
    }
  };

  const simulateCameraCapture = () => {
    // Generate a beautiful preset sample damaged car image to represent camera capture
    const presets = [
      "https://images.unsplash.com/photo-1562426509-5044a121aa49?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1617400325129-6539c3e62f02?auto=format&fit=crop&q=80&w=600",
      "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&q=80&w=600"
    ];
    const selectedPreset = presets[Math.floor(Math.random() * presets.length)];
    setCarConditionImg(selectedPreset);
    showToast("ຈຳລອງການຖ່າຍພາບສະພາບລົດສຳເລັດ!", "success");
  };

  // Customer booking submit
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTruck) {
      showToast("ກະລຸນາເລືອກປະເພດລົດລາກກ່ອນ", "error");
      return;
    }
    if (!customerName || !customerPhone) {
      showToast("ກະລຸນາປ້ອນຊື່ ແລະ ເບີໂທລະສັບ", "error");
      return;
    }

    setBookingStatus('submitting');
    try {
      const ordersColRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
      const orderPayload = {
        customerName,
        customerPhone,
        truckId: selectedTruck.id,
        truckName: selectedTruck.name,
        truckPrice: selectedTruck.price,
        driverName: selectedTruck.driverName,
        driverPhone: selectedTruck.driverPhone,
        carConditionImage: carConditionImg || "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&q=80&w=600", // fallback
        damageDescription: damageDesc || "ບໍ່ມີລາຍລະອຽດເພີ່ມເຕີມ",
        latitude: gpsLocation.lat,
        longitude: gpsLocation.lng,
        status: "ລໍຖ້າການຢືນຢັນ", // 'ລໍຖ້າການຢືນຢັນ' | 'ກຳລັງໄປຊ່ວຍເຫຼືອ' | 'ສຳເລັດແລ້ວ' | 'ຍົກເລີກແລ້ວ'
        timestamp: Date.now()
      };

      const docRef = await addDoc(ordersColRef, orderPayload);
      setActiveBookingId(docRef.id);
      setBookingStatus('success');
      showToast("ສົ່ງຄຳຮ້ອງຂໍຄວາມຊ່ວຍເຫຼືອສຳເລັດແລ້ວ!", "success");
      
      // Keep checking the specific order status updates in real-time
    } catch (err) {
      console.error("Booking error:", err);
      setBookingStatus('error');
      showToast("ເກີດຂໍ້ຜິດພາດໃນການສົ່ງຂໍ້ມູນ", "error");
    }
  };

  // Reset Booking Form
  const resetBookingForm = () => {
    setSelectedTruck(null);
    setCustomerName('');
    setCustomerPhone('');
    setCarConditionImg('');
    setDamageDesc('');
    setBookingStatus(null);
    setActiveBookingId(null);
  };

  // Admin Auth Login Action
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminUsername === 'admin' && adminPassword === 'admin') {
      setAdminLoggedIn(true);
      setAdminError('');
      showToast("ເຂົ້າສູ່ລະບົບຜູ້ດູແລສຳເລັດ", "success");
    } else {
      setAdminError("ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານ ບໍ່ຖືກຕ້ອງ!");
    }
  };

  // Admin Logout Action
  const handleAdminLogout = () => {
    setAdminLoggedIn(false);
    setAdminUsername('');
    setAdminPassword('');
  };

  // Admin CRUD Save Tow Truck
  const handleSaveTruck = async (e) => {
    e.preventDefault();
    if (!truckForm.name || !truckForm.price || !truckForm.driverName || !truckForm.driverPhone) {
      showToast("ກະລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບຖ້ວນ", "error");
      return;
    }

    try {
      const trucksColRef = collection(db, 'artifacts', appId, 'public', 'data', 'trucks');
      const payload = {
        name: truckForm.name,
        type: truckForm.type,
        price: Number(truckForm.price),
        driverName: truckForm.driverName,
        driverPhone: truckForm.driverPhone,
        suitability: truckForm.suitability || "ເໝາະສຳລັບລົດທົ່ວໄປ",
        imageUrl: truckForm.imageUrl || "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&q=80&w=600",
        status: truckForm.status || 'ว่าง'
      };

      if (truckFormId) {
        // Update
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'trucks', truckFormId);
        await updateDoc(docRef, payload);
        showToast("ແກ້ໄຂຂໍ້ມູນລົດລາກສຳເລັດ", "success");
      } else {
        // Create
        await addDoc(trucksColRef, payload);
        showToast("ເພີ່ມລົດລາກໃໝ່ສຳເລັດ", "success");
      }

      setIsEditingTruck(false);
      setTruckFormId(null);
      setTruckForm({
        name: '',
        type: 'small',
        price: '',
        driverName: '',
        driverPhone: '',
        suitability: '',
        imageUrl: '',
        status: 'ว่าง'
      });
    } catch (err) {
      console.error("Save truck error:", err);
      showToast("ເກີດຂໍ້ຜິດພາດໃນການບັນທຶກ", "error");
    }
  };

  // Admin CRUD Delete Tow Truck
  const handleDeleteTruck = async (id) => {
    if (confirm("ທ່ານແນ່ໃຈບໍ່ວ່າຕ້ອງການລຶບລົດລາກຄັນນີ້?")) {
      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'trucks', id);
        await deleteDoc(docRef);
        showToast("ລຶບຂໍ້ມູນລົດລາກສຳເລັດ", "warning");
      } catch (err) {
        console.error("Delete truck error:", err);
        showToast("ບໍ່ສາມາດລຶບຂໍ້ມູນໄດ້", "error");
      }
    }
  };

  // Admin Action: Set Edit form data
  const handleEditTruckClick = (truck) => {
    setTruckFormId(truck.id);
    setTruckForm({
      name: truck.name,
      type: truck.type,
      price: truck.price,
      driverName: truck.driverName,
      driverPhone: truck.driverPhone,
      suitability: truck.suitability,
      imageUrl: truck.imageUrl,
      status: truck.status
    });
    setIsEditingTruck(true);
  };

  // Admin Action: Update Order Status / Dispatch
  const handleUpdateOrderStatus = async (orderId, newStatus, truckIdToUpdate = null) => {
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderId);
      await updateDoc(docRef, { status: newStatus });
      showToast(`ອັບເດດສະຖານະເປັນ: ${newStatus}`, "success");

      // Optional: Update matched truck status
      if (truckIdToUpdate) {
        const truckRef = doc(db, 'artifacts', appId, 'public', 'data', 'trucks', truckIdToUpdate);
        const nextTruckStatus = newStatus === 'ກຳລັງໄປຊ່ວຍເຫຼືອ' ? 'ກຳລັງປະຕິບັດງານ' : 'ว่าง';
        await updateDoc(truckRef, { status: nextTruckStatus });
      }
    } catch (err) {
      console.error("Update order status error:", err);
      showToast("ບໍ່ສາມາດອັບເດດສະຖານະໄດ້", "error");
    }
  };

  // Get current active booking if exists
  const activeBooking = orders.find(o => o.id === activeBookingId);

  return (
    <div className="min-h-screen flex flex-col font-sans select-none text-gray-900 bg-[#0B3C1D] text-white" style={{ fontFamily: '"Phetsarath OT", sans-serif' }}>
      
      {/* 2. HEADER APP BAR (Orange - ສີສົ້ມ) */}
      <header className="bg-[#F97316] text-black shadow-lg sticky top-0 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentTab('customer')}>
            {/* Logo Emblem SVG */}
            <div className="bg-black text-[#F97316] p-2 rounded-xl shadow-inner flex items-center justify-center">
              <svg className="w-8 h-8 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-wider text-black">ລະບົບບໍລິການລົດລາກ</h1>
              <p className="text-xs font-semibold uppercase tracking-wider text-black opacity-80">24/7 Roadside Tow Assistance</p>
            </div>
          </div>

          {/* Switch Panel Controls */}
          <div className="flex bg-black bg-opacity-20 rounded-full p-1 border border-black border-opacity-10">
            <button 
              onClick={() => setCurrentTab('customer')}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
                currentTab === 'customer' 
                  ? 'bg-black text-[#F97316] shadow-md' 
                  : 'text-black hover:bg-black hover:bg-opacity-10'
              }`}
            >
              👤 ລູກຄ້າ (Customer)
            </button>
            <button 
              onClick={() => setCurrentTab('admin')}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
                currentTab === 'admin' 
                  ? 'bg-black text-[#F97316] shadow-md' 
                  : 'text-black hover:bg-black hover:bg-opacity-10'
              }`}
            >
              🛠 ຜູ້ດູແລລະບົບ (Admin)
            </button>
          </div>
        </div>
      </header>

      {/* Global Toast Alert banner */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 max-w-sm w-full animate-bounce">
          <div className={`p-4 rounded-xl shadow-2xl border flex items-center space-x-3 ${
            toast.type === 'success' ? 'bg-[#0B3C1D] text-white border-green-500' : 
            toast.type === 'warning' ? 'bg-[#F97316] text-black border-yellow-600' :
            'bg-red-700 text-white border-red-500'
          }`}>
            <span className="text-2xl">
              {toast.type === 'success' ? '✅' : toast.type === 'warning' ? '⚠️' : '🚨'}
            </span>
            <div className="flex-1 font-bold text-sm">
              {toast.message}
            </div>
          </div>
        </div>
      )}

      {/* MAIN MAIN CONTENT CONTAINER */}
      <main className="flex-grow max-w-7xl mx-auto w-full p-4 md:p-6">
        
        {/* =======================================================
            TAB A: CUSTOMER CLIENT SIDE VIEW
            ======================================================= */}
        {currentTab === 'customer' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* EMERGENCY BANNER CALLOUT */}
            <div className="bg-gradient-to-r from-red-600 to-red-800 rounded-3xl p-6 md:p-8 text-center md:text-left md:flex items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
              <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-8 translate-x-8">
                <svg className="w-96 h-96" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              </div>
              <div className="space-y-2 relative z-10">
                <span className="bg-yellow-400 text-black text-xs font-black uppercase px-3 py-1 rounded-full animate-pulse inline-block">
                  🚨 ສຸກເສີນ ຕະຫຼອດ 24 ຊົ່ວໂມງ
                </span>
                <h2 className="text-3xl font-black">ລົດເພ, ອຸປະຕິເຫດ ຕ້ອງການລົດລາກດ່ວນ?</h2>
                <p className="text-sm text-red-100 max-w-2xl">
                  ພວກເຮົາພ້ອມໃຫ້ບໍລິການລົດຍົກ, ລົດລາກ ແລະ ລົດເຄນ ຕະຫຼອດ 24 ຊົ່ວໂມງໃນນະຄອນຫຼວງວຽງຈັນ ແລະ ພື້ນທີ່ໃກ້ຄຽງ. 
                  ເລືອກຂະໜາດລົດລາກທີ່ເໝາະສົມກັບລົດຂອງທ່ານດ້ານລຸ່ມນີ້ ເພື່ອແຈ້ງຂໍຄວາມຊ່ວຍເຫຼືອທັນທີ!
                </p>
              </div>
              <div className="mt-6 md:mt-0 relative z-10 flex flex-col items-center justify-center bg-black bg-opacity-30 p-4 rounded-2xl border border-red-500">
                <span className="text-xs text-red-200">ເບີໂທສາຍດ່ວນ</span>
                <a href="tel:1199" className="text-3xl font-black text-yellow-300 hover:underline">1199</a>
              </div>
            </div>

            {/* LIVE SYSTEM STATUS TRACKER (IF CUSTOMER SUBMITTED AN ACTIVE BOOKING) */}
            {activeBooking && (
              <div className="bg-slate-900 border-2 border-yellow-400 rounded-3xl p-6 shadow-2xl animate-pulse">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-700 pb-4 mb-4">
                  <div>
                    <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">ຕິດຕາມສະຖານະການຈອງຫຼ້າສຸດ (Real-time Tracker)</span>
                    <h3 className="text-xl font-bold">ຮຽກຮ້ອງໂດຍ: {activeBooking.customerName}</h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 animate-ping"></span>
                    <span className={`px-4 py-1.5 rounded-full text-sm font-black text-black ${
                      activeBooking.status === 'ລໍຖ້າການຢືນຢັນ' ? 'bg-yellow-400' :
                      activeBooking.status === 'ກຳລັງໄປຊ່ວຍເຫຼືອ' ? 'bg-blue-400 animate-bounce' :
                      'bg-green-400'
                    }`}>
                      🚦 {activeBooking.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left Column: Assigned Info */}
                  <div className="space-y-2 bg-slate-800 p-4 rounded-xl">
                    <p className="text-xs text-gray-400">ລົດລາກທີ່ເລືອກ:</p>
                    <p className="text-lg font-bold text-[#F97316]">{activeBooking.truckName}</p>
                    <p className="text-xs text-gray-400">ຄ່າບໍລິການເລີ່ມຕົ້ນ:</p>
                    <p className="text-xl font-extrabold text-yellow-400">{activeBooking.truckPrice?.toLocaleString()} LAK</p>
                  </div>

                  {/* Middle Column: Driver Info */}
                  <div className="space-y-2 bg-slate-800 p-4 rounded-xl">
                    <p className="text-xs text-gray-400">👤 ພະນັກງານຂັບລົດລາກ:</p>
                    <p className="text-lg font-bold">{activeBooking.driverName || 'ກຳລັງຈັດສັນພະນັກງານ...'}</p>
                    {activeBooking.driverPhone && (
                      <div>
                        <p className="text-xs text-gray-400">ເບີໂທຕິດຕໍ່:</p>
                        <a href={`tel:${activeBooking.driverPhone}`} className="inline-block bg-[#F97316] text-black font-bold px-3 py-1 rounded-lg text-sm mt-1">
                          📞 {activeBooking.driverPhone}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Interactive Map Marker Link */}
                  <div className="space-y-2 bg-slate-800 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                      <p className="text-xs text-gray-400">📍 ພິກັດສະຖານທີ່ເກີດເຫດ:</p>
                      <p className="text-xs font-mono text-gray-300">Lat: {activeBooking.latitude?.toFixed(5)}, Lng: {activeBooking.longitude?.toFixed(5)}</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          const url = `https://www.google.com/maps/search/?api=1&query=${activeBooking.latitude},${activeBooking.longitude}`;
                          window.open(url, '_blank');
                        }}
                        className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-lg text-xs hover:bg-blue-700 transition"
                      >
                        🗺️ ເບິ່ງໃນ Google Maps
                      </button>
                      <button 
                        onClick={resetBookingForm}
                        className="bg-red-600 text-white font-bold px-3 py-2 rounded-lg text-xs hover:bg-red-700 transition"
                      >
                        ❌ ປິດຕິດຕາມ
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-800 text-center text-xs text-gray-400">
                  * ຂໍ້ມູນອັບເດດແບບອັດຕະໂນມັດຈາກຖານຂໍ້ມູນ Firestore Cloud Real-time
                </div>
              </div>
            )}

            {/* STEP 1: CHOOSE A TOW TRUCK CAROUSEL */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-800 pb-2">
                <h3 className="text-2xl font-black flex items-center space-x-2">
                  <span>🚜</span>
                  <span>ຂັ້ນຕອນທີ 1: ເລືອກຂະໜາດ ແລະ ປະເພດລົດລາກ</span>
                </h3>
                <span className="text-sm bg-[#F97316] text-black px-3 py-1 rounded-full font-bold">
                  {trucks.length} ຄັນພ້ອມບໍລິການ
                </span>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                  <p className="mt-4 text-emerald-200">ກຳລັງໂຫຼດຂໍ້ມູນລົດລາກຈາກ Cloud Database...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {trucks.map((truck) => (
                    <div 
                      key={truck.id} 
                      className={`rounded-3xl overflow-hidden transition-all duration-300 transform bg-slate-900 border-4 flex flex-col h-full ${
                        selectedTruck?.id === truck.id 
                          ? 'border-[#F97316] scale-102 ring-4 ring-orange-500/20' 
                          : 'border-transparent hover:border-emerald-700'
                      }`}
                    >
                      <div className="relative h-48 overflow-hidden bg-gray-800">
                        <img 
                          src={truck.imageUrl} 
                          alt={truck.name} 
                          className="w-full h-full object-cover transform hover:scale-110 transition duration-500"
                          onError={(e) => {
                            e.target.src = "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&q=80&w=600";
                          }}
                        />
                        <div className="absolute top-3 right-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold text-black ${
                            truck.status === 'ว่าง' ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'
                          }`}>
                            {truck.status === 'ว่าง' ? '🟢 ພ້ອມບໍລິການ' : '🟡 ຕິດງານຢູ່'}
                          </span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
                          <span className="bg-[#F97316] text-black text-xs font-black px-2.5 py-1 rounded-md uppercase">
                            {truck.type === 'small' ? 'ຂະໜາດນ້ອຍ' : truck.type === 'medium' ? 'ຂະໜາດກາງ' : 'ຂະໜາດໃຫຍ່'}
                          </span>
                        </div>
                      </div>

                      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <h4 className="text-xl font-bold leading-snug">{truck.name}</h4>
                          <p className="text-sm text-emerald-300">{truck.suitability}</p>
                          <div className="flex items-center space-x-2 text-xs text-gray-400 bg-slate-800 p-2.5 rounded-xl">
                            <span>👤 ຄົນຂັບ: {truck.driverName}</span>
                            <span>•</span>
                            <span>📞 {truck.driverPhone}</span>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-gray-800 flex items-center justify-between">
                          <div>
                            <span className="text-xs text-gray-400 block">ຄ່າບໍລິການເລີ່ມຕົ້ນ</span>
                            <span className="text-2xl font-black text-yellow-400">{truck.price?.toLocaleString()} LAK</span>
                          </div>

                          {/* ACTION BUTTON (Blue / Blue-600) */}
                          <button 
                            onClick={() => setSelectedTruck(truck)}
                            className={`px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all duration-300 ${
                              selectedTruck?.id === truck.id 
                                ? 'bg-yellow-500 text-black shadow-lg hover:bg-yellow-600' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                            }`}
                          >
                            {selectedTruck?.id === truck.id ? '✓ ເລືອກແລ້ວ' : 'ເລືອກຄັນນີ້'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* STEP 2: BOOKING FORM & DISPATCH DETAILS */}
            <div className="bg-slate-900 rounded-3xl p-6 md:p-8 border border-emerald-800 shadow-2xl">
              <h3 className="text-2xl font-black flex items-center space-x-2 border-b border-gray-800 pb-4 mb-6">
                <span>📝</span>
                <span>ຂັ້ນຕອນທີ 2: ປ້ອນຂໍ້ມູນການຂໍຄວາມຊ່ວຍເຫຼືອ & ພິກັດ GPS</span>
              </h3>

              {!selectedTruck ? (
                <div className="text-center py-10 bg-slate-800/40 rounded-2xl border-2 border-dashed border-gray-700">
                  <p className="text-lg text-yellow-400 font-bold">⚠️ ກະລຸນາເລືອກລົດລາກທີ່ທ່ານຕ້ອງການດ້ານເທິງກ່ອນ!</p>
                  <p className="text-sm text-gray-400 mt-1">ເພື່ອໃຫ້ນຳຂໍ້ມູນລາຄາ ແລະ ຂະໜາດມາຄຳນວນໃນໃບບິນ</p>
                </div>
              ) : (
                <form onSubmit={handleBookingSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Customer details */}
                  <div className="space-y-6">
                    <div>
                      <span className="bg-[#F97316] text-black text-xs font-black px-3 py-1 rounded-full mb-3 inline-block">
                        ລົດລາກທີ່ເລືອກ: {selectedTruck.name} ({selectedTruck.price?.toLocaleString()} LAK)
                      </span>
                      <h4 className="text-lg font-bold text-white">ຂໍ້ມູນຕິດຕໍ່ລູກຄ້າ</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-300">ຊື່ ແລະ ນາມສະກຸນ *</label>
                        <input 
                          type="text" 
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="ຕົວຢ່າງ: ທ້າວ ຄຳດີ" 
                          className="w-full bg-slate-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F97316] transition"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-300">ເບີໂທລະສັບຕິດຕໍ່ *</label>
                        <input 
                          type="tel" 
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="ຕົວຢ່າງ: 020 55XXXXXX" 
                          className="w-full bg-slate-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F97316] transition"
                        />
                      </div>
                    </div>

                    {/* Camera Capture Simulation Element */}
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-gray-300 block">ຮູບພາບສະພາບລົດປະຈຸບັນ *</label>
                      <div className="flex flex-wrap gap-2">
                        {/* Simulation Button (Yellow for action/edit) */}
                        <button 
                          type="button"
                          onClick={simulateCameraCapture}
                          className="bg-yellow-500 hover:bg-yellow-600 text-black font-black px-4 py-2.5 rounded-xl text-sm flex items-center space-x-2 transition"
                        >
                          <span>📸 ຖ່າຍຮູບດ່ວນ (ຈຳລອງ)</span>
                        </button>
                        
                        {/* Real file uploader (Blue for file select) */}
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2.5 rounded-xl text-sm flex items-center space-x-2 transition"
                        >
                          <span>📁 ອັບໂຫຼດຮູບຈາກມືຖື</span>
                        </button>
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*"
                          className="hidden" 
                        />
                      </div>

                      {/* Preview Image */}
                      {carConditionImg ? (
                        <div className="relative mt-2 max-w-xs rounded-xl overflow-hidden border-2 border-[#F97316]">
                          <img src={carConditionImg} alt="Condition Preview" className="w-full h-40 object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setCarConditionImg('')}
                            className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 transition"
                            title="Remove image"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="border border-dashed border-gray-700 rounded-xl p-6 text-center text-gray-500 text-xs">
                          ບໍ່ມີຮູບພາບສະພາບລົດ (ແນະນຳໃຫ້ຖ່າຍຮູບເພື່ອໃຫ້ແອດມິນປະເມີນໄດ້ງ່າຍຂຶ້ນ)
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-gray-300">ອະທິບາຍສະພາບຄວາມເສຍຫາຍ</label>
                      <textarea 
                        value={damageDesc}
                        onChange={(e) => setDamageDesc(e.target.value)}
                        placeholder="ຕົວຢ່າງ: ລົດເກັງຢາງຮົ່ວ, ໝໍ້ໄຟເສຍ ຫຼື ເກີດອຸປະຕິເຫດແຮງງານຍົກຂຶ້ນບໍ່ໄດ້..."
                        rows="3"
                        className="w-full bg-slate-800 border border-gray-700 rounded-xl p-4 text-white focus:outline-none focus:border-[#F97316] transition"
                      ></textarea>
                    </div>
                  </div>

                  {/* Right Column: Location & Live Interactive Map */}
                  <div className="space-y-6 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-lg font-bold text-white">📍 ສະຖານທີ່ເກີດເຫດ (GPS Location)</h4>
                        
                        {/* Auto detect button (Blue) */}
                        <button 
                          type="button"
                          onClick={detectLocation}
                          disabled={detectingGps}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-3 py-1.5 rounded-lg transition-all duration-300"
                        >
                          {detectingGps ? '🔄 ກຳລັງດຶງພິກັດ...' : '📡 ດຶງ GPS ປະຈຸບັນ'}
                        </button>
                      </div>

                      <div className="bg-slate-800 p-4 rounded-2xl border border-gray-700">
                        <div className="flex justify-between text-xs text-gray-400 mb-2">
                          <span>ພິກັດລະຕິຈູດ (Latitude): {gpsLocation.lat.toFixed(6)}</span>
                          <span>ພິກັດລອງຈິຈູດ (Longitude): {gpsLocation.lng.toFixed(6)}</span>
                        </div>

                        {/* Interactive map placeholder */}
                        <div className="h-60 rounded-xl relative overflow-hidden bg-slate-950 border border-gray-800 flex flex-col items-center justify-center">
                          {/* Simulated Map Backdrop */}
                          <div className="absolute inset-0 bg-opacity-30 pointer-events-none opacity-40 bg-[radial-gradient(#2c3e50_1px,transparent_1px)] [background-size:16px_16px]"></div>
                          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
                            {/* Marker Icon */}
                            <div className="relative">
                              <span className="text-4xl animate-bounce block">📍</span>
                              <div className="w-6 h-1.5 bg-black rounded-full filter blur-sm opacity-50 absolute -bottom-1 left-2"></div>
                            </div>
                            <span className="bg-black text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap mt-2 border border-yellow-500 shadow-xl">
                              ຈຸດເກີດເຫດຂອງທ່ານ
                            </span>
                          </div>

                          {/* Map Coordinates and controls overlay */}
                          <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-md p-2 rounded-lg text-center flex flex-col text-[10px] text-gray-300 border border-gray-800">
                            <span>🗺️ ແຜນທີ່ຈຳລອງນະຄອນຫຼວງວຽງຈັນ (Vientiane Area)</span>
                            <span className="text-emerald-400 font-mono mt-1">ຄລິກແຜນທີ່ເພື່ອປ່ຽນຕຳແໜ່ງ: Lat/Lng preset loaded!</span>
                          </div>

                          {/* Action hotspots to simulate map dragging / clicking */}
                          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-0 cursor-pointer">
                            <div onClick={() => setGpsLocation({ lat: 17.9780, lng: 102.6122 })} title="ຫໍພະແກ້ວ"></div>
                            <div onClick={() => setGpsLocation({ lat: 17.9623, lng: 102.6042 })} title="ແຄມຂອງ"></div>
                            <div onClick={() => setGpsLocation({ lat: 17.9902, lng: 102.6341 })} title="ທາດຫຼວງ"></div>
                            <div onClick={() => setGpsLocation({ lat: 17.9611, lng: 102.6455 })} title="ດົງໂດກ"></div>
                            <div onClick={() => setGpsLocation({ lat: 17.9702, lng: 102.6231 })} title="ຕະຫຼາດເຊົ້າ"></div>
                            <div onClick={() => setGpsLocation({ lat: 17.9811, lng: 102.6199 })} title="ປະຕູໄຊ"></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Final Cart Summary and Submit */}
                    <div className="bg-slate-800 p-6 rounded-2xl border border-gray-700 space-y-4">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">ປະເພດລົດລາກ:</span>
                        <span className="font-bold text-[#F97316]">{selectedTruck.name}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm border-b border-gray-700 pb-2">
                        <span className="text-gray-400">ພະນັກງານຂັບລົດ:</span>
                        <span className="font-bold">{selectedTruck.driverName}</span>
                      </div>
                      <div className="flex justify-between items-center text-lg font-black pt-2">
                        <span>ລາຄາບໍລິການທັງໝົດ:</span>
                        <span className="text-yellow-400">{selectedTruck.price?.toLocaleString()} LAK</span>
                      </div>

                      {/* SUBMIT BUTTON (Blue for Primary Action) */}
                      <button 
                        type="submit"
                        disabled={bookingStatus === 'submitting'}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl text-lg shadow-lg transform active:scale-95 transition-all duration-300 flex items-center justify-center space-x-2"
                      >
                        {bookingStatus === 'submitting' ? (
                          <>
                            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                            <span>ກຳລັງສົ່ງຂໍ້ມູນ...</span>
                          </>
                        ) : (
                          <>
                            <span>🚨 ສົ່ງຄຳຮ້ອງຂໍລົດລາກດ່ວນ</span>
                          </>
                        )}
                      </button>

                      {bookingStatus === 'success' && (
                        <div className="bg-emerald-950 border border-green-500 p-4 rounded-xl text-center text-green-300 text-sm font-bold">
                          🎉 ສົ່ງຂໍ້ມູນສຳເລັດ! ແອດມິນກຳລັງກວດສອບ ແລະ ຈະຕິດຕໍ່ຫາທ່ານໂດຍດ່ວນ. ຕິດຕາມສະຖານະໄດ້ທີ່ແຖບດ້ານເທິງ.
                        </div>
                      )}
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* =======================================================
            TAB B: ADMIN PORTAL VIEW (Authentication + Dashboard)
            ======================================================= */}
        {currentTab === 'admin' && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* 1. Admin login credentials checker */}
            {!adminLoggedIn ? (
              <div className="max-w-md mx-auto bg-slate-900 rounded-3xl p-8 border border-emerald-800 shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                  <span className="text-4xl">🛠️</span>
                  <h3 className="text-2xl font-black text-white">ເຂົ້າສູ່ລະບົບຜູ້ດູແລລະບົບ</h3>
                  <p className="text-xs text-gray-400">ລະບົບບໍລິການ ແລະ ຈັດການລົດລາກ (Laos Towing Admin Dashboard)</p>
                </div>

                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-300">ຊື່ຜູ້ໃຊ້ (Username)</label>
                    <input 
                      type="text"
                      required
                      placeholder="admin"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      className="w-full bg-slate-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F97316] transition"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-300">ລະຫັດຜ່ານ (Password)</label>
                    <input 
                      type="password"
                      required
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F97316] transition"
                    />
                  </div>

                  {adminError && (
                    <p className="text-red-500 text-xs font-bold bg-red-950/50 p-2.5 rounded-lg border border-red-800 text-center">
                      ❌ {adminError}
                    </p>
                  )}

                  {/* LOGIN SUBMIT BUTTON (Blue) */}
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl shadow-lg transition"
                  >
                    🔐 ເຂົ້າສູ່ລະບົບ
                  </button>
                </form>

                <div className="bg-slate-800 p-4 rounded-xl text-center text-xs text-yellow-500 border border-yellow-800/30">
                  <span className="font-bold">ບັນຊີເຂົ້າລະບົບສາທິດ:</span> <br/>
                  Username: <code className="font-mono bg-black px-1.5 py-0.5 rounded text-white">admin</code> / Password: <code className="font-mono bg-black px-1.5 py-0.5 rounded text-white">admin</code>
                </div>
              </div>
            ) : (
              // ADMIN CONTROL CENTER IS NOW ACTIVE
              <div className="space-y-8">
                
                {/* Admin Subheader Panel */}
                <div className="bg-slate-900 rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 border border-emerald-800 shadow-xl">
                  <div>
                    <h3 className="text-2xl font-black text-white flex items-center space-x-2">
                      <span>⚙️</span>
                      <span>ແຜງຄວບຄຸມຜູ້ດູແລລະບົບ (Admin Dashboard)</span>
                    </h3>
                    <p className="text-xs text-emerald-400 mt-1">ຈັດການຂໍ້ມູນລົດລາກ real-time, ຮັບອໍເດີສຸກເສີນ ແລະ ກົດສົ່ງລົດ (Dispatch)</p>
                  </div>
                  
                  {/* Logout Button (Red for Cancel/Exit action) */}
                  <button 
                    onClick={handleAdminLogout}
                    className="bg-red-600 hover:bg-red-700 text-white font-black px-4 py-2.5 rounded-xl text-xs transition"
                  >
                    🔌 ອອກຈາກລະບົບ
                  </button>
                </div>

                {/* TWO-COLUMN GRID: 1. LIVE ORDERS / EMERGENCY REQUESTS, 2. TOW TRUCK CRUD */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* LEFT COLUMN: CRITICAL REQUEST QUEUE (8 COLS) */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="flex items-center justify-between border-b border-emerald-800 pb-2">
                      <h4 className="text-xl font-bold flex items-center space-x-2">
                        <span className="animate-ping inline-block w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                        <span>ລາຍການຂໍຄວາມຊ່ວຍເຫຼືອສຸກເສີນ ({orders.length})</span>
                      </h4>
                      <span className="text-xs bg-slate-800 text-gray-400 px-3 py-1 rounded-full">
                        ຂໍ້ມູນ Real-time ຈາກ Firestore
                      </span>
                    </div>

                    {orders.length === 0 ? (
                      <div className="bg-slate-900 rounded-2xl p-8 text-center text-gray-500 border border-gray-800">
                        🏜️ ບໍ່ມີລາຍການຂໍຄວາມຊ່ວຍເຫຼືອເຂົ້າມາໃນລະບົບເທື່ອ
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {orders.map((order) => (
                          <div 
                            key={order.id} 
                            className={`bg-slate-900 border-2 rounded-2xl p-5 md:p-6 transition-all duration-300 ${
                              order.status === 'ລໍຖ້າການຢືນຢັນ' ? 'border-yellow-500 bg-yellow-500/5' :
                              order.status === 'ກຳລັງໄປຊ່ວຍເຫຼືອ' ? 'border-blue-500 bg-blue-500/5' :
                              'border-gray-800 bg-slate-900'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3 mb-4">
                              <div>
                                <span className="text-[10px] uppercase font-mono tracking-widest text-gray-400">Order ID: {order.id}</span>
                                <h5 className="text-lg font-bold text-white flex items-center space-x-2">
                                  <span>👤 {order.customerName}</span>
                                  <a href={`tel:${order.customerPhone}`} className="text-sm font-black text-yellow-400 hover:underline">
                                    (📞 {order.customerPhone})
                                  </a>
                                </h5>
                              </div>

                              <div className="flex items-center space-x-2">
                                <span className={`text-xs font-black px-3 py-1.5 rounded-full text-black ${
                                  order.status === 'ລໍຖ້າການຢືນຢັນ' ? 'bg-yellow-400' :
                                  order.status === 'ກຳລັງໄປຊ່ວຍເຫຼືອ' ? 'bg-blue-400' :
                                  order.status === 'ສຳເລັດແລ້ວ' ? 'bg-green-400' :
                                  'bg-red-400'
                                }`}>
                                  {order.status}
                                </span>
                              </div>
                            </div>

                            {/* Details Row */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                              {/* Left detail Column: Car image (3 cols) */}
                              <div className="md:col-span-4 space-y-2">
                                <p className="text-xs text-gray-400">ຮູບສະພາບລົດຈຳລອງ:</p>
                                <div className="h-32 rounded-xl overflow-hidden border border-gray-700 bg-black">
                                  <img 
                                    src={order.carConditionImage} 
                                    alt="Car condition" 
                                    className="w-full h-full object-cover" 
                                    onError={(e) => {
                                      e.target.src = "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?auto=format&fit=crop&q=80&w=600";
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Center detail Column: Description & Selected Truck info (5 cols) */}
                              <div className="md:col-span-5 space-y-3">
                                <div>
                                  <p className="text-xs text-gray-400">ລາຍລະອຽດອາການ:</p>
                                  <p className="text-sm text-gray-200 font-bold bg-slate-950 p-3 rounded-xl border border-gray-800">
                                    {order.damageDescription}
                                  </p>
                                </div>

                                <div className="bg-slate-800 p-2.5 rounded-xl text-xs space-y-1 border border-gray-700">
                                  <p className="text-gray-400">ລົດລາກທີ່ເລືອກ: <span className="font-bold text-[#F97316]">{order.truckName}</span></p>
                                  <p className="text-gray-400">ລາຄາບໍລິການ: <span className="font-bold text-yellow-400">{order.truckPrice?.toLocaleString()} LAK</span></p>
                                </div>
                              </div>

                              {/* Right detail Column: Map coordination preset (3 cols) */}
                              <div className="md:col-span-3 space-y-2 flex flex-col justify-between">
                                <div className="bg-slate-950 p-2.5 rounded-xl border border-gray-800 text-center">
                                  <p className="text-[10px] text-gray-400 block uppercase">ພິກັດ GPS ຂອງລູກຄ້າ</p>
                                  <span className="text-xs font-mono text-emerald-400">{order.latitude?.toFixed(4)}, {order.longitude?.toFixed(4)}</span>
                                  <button 
                                    onClick={() => {
                                      const url = `https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`;
                                      window.open(url, '_blank');
                                    }}
                                    className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-1 rounded transition"
                                  >
                                    🗺️ ເບິ່ງແຜນທີ່ Google
                                  </button>
                                </div>

                                <span className="text-[10px] text-gray-500 font-mono block text-right">
                                  {new Date(order.timestamp).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {/* DISPATCH CONTROLLER - ACTION BUTTONS */}
                            <div className="mt-5 pt-4 border-t border-gray-800 flex flex-wrap justify-between items-center gap-3">
                              <span className="text-xs text-yellow-500 font-bold">ຈັດການສະຖານະອໍເດີ:</span>
                              
                              <div className="flex gap-2">
                                {/* Yellow button for Warning/Edit action */}
                                {order.status === 'ລໍຖ້າການຢືນຢັນ' && (
                                  <button 
                                    onClick={() => handleUpdateOrderStatus(order.id, 'ກຳລັງໄປຊ່ວຍເຫຼືອ', order.truckId)}
                                    className="bg-yellow-500 hover:bg-yellow-600 text-black font-black px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition"
                                  >
                                    <span>🚜 ກົດສົ່ງລົດລາກ (Dispatch)</span>
                                  </button>
                                )}

                                {/* Blue button for primary action */}
                                {order.status === 'ກຳລັງໄປຊ່ວຍເຫຼືອ' && (
                                  <button 
                                    onClick={() => handleUpdateOrderStatus(order.id, 'ສຳເລັດແລ້ວ', order.truckId)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition"
                                  >
                                    <span>✅ ຢືນຢັນການຊ່ວຍເຫຼືອສຳເລັດ</span>
                                  </button>
                                )}

                                {/* Red button for cancel/delete action */}
                                {order.status !== 'ສຳເລັດແລ້ວ' && order.status !== 'ຍົກເລີກແລ້ວ' && (
                                  <button 
                                    onClick={() => handleUpdateOrderStatus(order.id, 'ຍົກເລີກແລ້ວ', order.truckId)}
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition"
                                  >
                                    ຍົກເລີກ
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* RIGHT COLUMN: TOW TRUCK FLEET CRUD MANAGEMENT (4 COLS) */}
                  <div className="lg:col-span-4 space-y-6">
                    <div className="flex items-center justify-between border-b border-emerald-800 pb-2">
                      <h4 className="text-xl font-bold flex items-center space-x-2">
                        <span>🚜</span>
                        <span>ຈັດການລົດລາກ ({trucks.length})</span>
                      </h4>

                      {/* Yellow / Blue Button to Toggle Add Form */}
                      <button 
                        onClick={() => {
                          setIsEditingTruck(!isEditingTruck);
                          setTruckFormId(null);
                          setTruckForm({
                            name: '',
                            type: 'small',
                            price: '',
                            driverName: '',
                            driverPhone: '',
                            suitability: '',
                            imageUrl: '',
                            status: 'ว่าง'
                          });
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-3 py-1.5 rounded-lg transition"
                      >
                        {isEditingTruck && !truckFormId ? '✕ ປິດຟອມ' : '➕ ເພີ່ມຄັນໃໝ່'}
                      </button>
                    </div>

                    {/* CRUD Form (Add or Edit) */}
                    {isEditingTruck && (
                      <form onSubmit={handleSaveTruck} className="bg-slate-900 border border-emerald-800 p-5 rounded-2xl space-y-4 animate-slideIn">
                        <h5 className="text-sm font-black text-[#F97316] uppercase tracking-wider border-b border-gray-800 pb-2">
                          {truckFormId ? '📝 ແກ້ໄຂຂໍ້ມູນລົດລາກ' : '➕ ເພີ່ມຂໍ້ມູນລົດລາກໃໝ່'}
                        </h5>

                        <div className="space-y-1">
                          <label className="text-xs text-gray-400 font-bold">ຊື່ລົດລາກ & ຂະໜາດ *</label>
                          <input 
                            type="text" 
                            required
                            value={truckForm.name}
                            onChange={(e) => setTruckForm({...truckForm, name: e.target.value})}
                            placeholder="ຕົວຢ່າງ: ລົດຍົກຂະໜາດນ້ອຍ A-1" 
                            className="w-full bg-slate-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-gray-400 font-bold">ປະເພດ</label>
                            <select 
                              value={truckForm.type}
                              onChange={(e) => setTruckForm({...truckForm, type: e.target.value})}
                              className="w-full bg-slate-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                            >
                              <option value="small">Small (ຂະໜາດນ້ອຍ)</option>
                              <option value="medium">Medium (ຂະໜາດກາງ)</option>
                              <option value="heavy">Heavy (ຂະໜາດໃຫຍ່)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-400 font-bold">ລາຄາບໍລິການ (LAK) *</label>
                            <input 
                              type="number" 
                              required
                              value={truckForm.price}
                              onChange={(e) => setTruckForm({...truckForm, price: e.target.value})}
                              placeholder="150000" 
                              className="w-full bg-slate-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs text-gray-400 font-bold">ຊື່ພະນັກງານຂັບ *</label>
                            <input 
                              type="text" 
                              required
                              value={truckForm.driverName}
                              onChange={(e) => setTruckForm({...truckForm, driverName: e.target.value})}
                              placeholder="ທ້າວ ສົມຊາຍ" 
                              className="w-full bg-slate-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-400 font-bold">ເບີໂທຕິດຕໍ່ *</label>
                            <input 
                              type="text" 
                              required
                              value={truckForm.driverPhone}
                              onChange={(e) => setTruckForm({...truckForm, driverPhone: e.target.value})}
                              placeholder="020 XXXXXXX" 
                              className="w-full bg-slate-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-gray-400 font-bold">ຄວາມເໝາະສົມ (Suitability Description)</label>
                          <input 
                            type="text" 
                            value={truckForm.suitability}
                            onChange={(e) => setTruckForm({...truckForm, suitability: e.target.value})}
                            placeholder="ເໝາະສຳລັບລົດເກັງ, SUV" 
                            className="w-full bg-slate-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-gray-400 font-bold">ຮູບພາບລົດລາກ (URL Link)</label>
                          <input 
                            type="url" 
                            value={truckForm.imageUrl}
                            onChange={(e) => setTruckForm({...truckForm, imageUrl: e.target.value})}
                            placeholder="https://example.com/image.jpg" 
                            className="w-full bg-slate-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          />
                          <p className="text-[9px] text-gray-500">ໃສ່ລິ້ງຄ໌ຮູບພາບລົດລາກ ຫຼື ປະປ່ອຍໄວ້ເພື່ອໃຊ້ຮູບພາບຕົ້ນແບບ</p>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-gray-400 font-bold">ສະຖານະລົດ</label>
                          <select 
                            value={truckForm.status}
                            onChange={(e) => setTruckForm({...truckForm, status: e.target.value})}
                            className="w-full bg-slate-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                          >
                            <option value="ว่าง">ว่าง (Available)</option>
                            <option value="ກຳລັງປະຕິບັດງານ">ກຳລັງປະຕິບັດງານ (Busy)</option>
                          </select>
                        </div>

                        {/* Form Buttons */}
                        <div className="flex gap-2 pt-2">
                          <button 
                            type="submit"
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2 rounded-xl transition"
                          >
                            💾 ບັນທຶກຂໍ້ມູນ
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              setIsEditingTruck(false);
                              setTruckFormId(null);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                          >
                            ຍົກເລີກ
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Tow Trucks list inside Admin */}
                    <div className="space-y-3">
                      {trucks.map((truck) => (
                        <div key={truck.id} className="bg-slate-900 border border-gray-800 rounded-2xl p-4 flex items-center space-x-3">
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-800 shrink-0">
                            <img src={truck.imageUrl} alt={truck.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-1">
                              <h5 className="text-xs font-bold text-white truncate">{truck.name}</h5>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                truck.status === 'ว่าง' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'
                              }`}>
                                {truck.status}
                              </span>
                            </div>
                            <p className="text-[11px] font-black text-yellow-400">{truck.price?.toLocaleString()} LAK</p>
                            <p className="text-[10px] text-gray-500 truncate">👤 {truck.driverName} • {truck.driverPhone}</p>
                          </div>
                          
                          {/* Admin Edit/Delete Actions */}
                          <div className="flex flex-col gap-1.5">
                            <button 
                              onClick={() => handleEditTruckClick(truck)}
                              className="bg-yellow-500 hover:bg-yellow-600 text-black text-[10px] font-bold p-1 rounded transition"
                              title="ແກ້ໄຂ"
                            >
                              ✏️
                            </button>
                            <button 
                              onClick={() => handleDeleteTruck(truck.id)}
                              className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold p-1 rounded transition"
                              title="ລຶບ"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>

                </div>

              </div>
            )}

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-gray-400 py-6 mt-12 border-t border-emerald-950">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <div className="text-center md:text-left">
            <p className="font-bold text-[#F97316]">© 2026 ລະບົບບໍລິການລົດລາກສຸກເສີນ 24 ຊົ່ວໂມງ - ນະຄອນຫຼວງວຽງຈັນ</p>
            <p className="text-[10px] text-gray-600">ລະບົບຖານຂໍ້ມູນ Cloud Database ເຊື່ອມຕໍ່ Real-time ຜ່ານ Firebase Firestore</p>
          </div>
          <div className="flex space-x-4">
            <span className="text-emerald-500 font-mono">Status: Firebase Online ✅</span>
            <span>•</span>
            <span className="font-bold">ໂທສາຍດ່ວນ: 1199</span>
          </div>
        </div>
      </footer>
    </div>
  );
}