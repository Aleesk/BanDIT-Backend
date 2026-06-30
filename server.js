const express = require("express");
const cors = require("cors");

const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccount.json");

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("BanDIT Backend funcionando");
});

app.post("/sendAlert", async (req, res) => {
    try {
        const { patientId } = req.body;
        console.log("[BanDIT] patientId:", patientId);
        const patientDoc = await db.collection("users").doc(patientId).get();
        console.log("[BanDIT] paciente existe:", patientDoc.exists);
        const patientData = patientDoc.data();
        console.log("[BanDIT] datos paciente:", patientData);

        const caregiverQuery = await db.collection("users")
            .where("linkedPatientId", "==", patientId)
            .where("role", "==", "caregiver")
            .limit(1)
            .get();
        console.log("[BanDIT] cuidadores encontrados:", caregiverQuery.size);

        if (caregiverQuery.empty) {
            return res.status(400).json({
                success: false,
                error: "[BanDIT] Paciente sin cuidador vinculado"
            });
        }

        const caregiverDoc = caregiverQuery.docs[0];
        const caregiverData = caregiverDoc.data();
        const token = caregiverData.fcmToken;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: "[BanDIT] El cuidador no tiene token FCM registrado"
            });
        }

        const patientName = patientData.name ?? "El paciente";

        const messageId = await getMessaging().send({
            token,
            notification: {
                title: "🚨 Alerta BanDIT",
                body: `${patientName} necesita ayuda urgente`
            },
            data: {
                patientId,
                patientName,
                type: "CRISIS_ALERT"
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "bandit_alerts",
                    sound: "default",
                    priority: "max",
                    visibility: "public"
                }
            }
        });

        await db.collection("alerts").add({
            patientId,
            caregiverId: caregiverDoc.id,
            patientName,
            createdAt: new Date(),
            status: "sent"
        });

        console.log(`[BanDIT] Alerta enviada a ${caregiverData.name} (${messageId})`);

        res.json({ success: true, messageId });

    } catch (error) {
        console.error("[BanDIT] Error en /sendAlert:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}`));