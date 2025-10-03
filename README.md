## Moje řešení

### 1. Collector
**Úkol:** Odebírat data z MQTT a předávat je do RabbitMQ fronty `car_state_raw`.  
**Řešení:**
- připojuje se k MQTT brokeru,
- odebírá topic `car/1/#` (resp. dynamicky z configu `SUBSCRIBE_TOPIC`),
- každou zprávu validuje jako JSON,
- balí do objektu `{ topic, payload, timestamp }`,
- posílá do RabbitMQ fronty.  
✅ Hotovo.

### 2. Writer
**Úkol:** Číst zprávy z RabbitMQ, udržovat stav aut v paměti a každých 5 sekund uložit snapshot do Postgresu.  
**Řešení:**
- připojuje se k RabbitMQ i Postgresu,
- `carStates` drží stav pro každé auto (latitude, longitude, gear, speed, socBatteries, capacityBatteries),
- používá handlery pro každý typ topicu (latitude, longitude, gear, speed, soc, capacity),
- každých 5 sekund:
  - počítá vážený průměr SOC podle kapacit baterií,
  - loguje chybějící data (⚠️ pokud SOC nebo capacity chybí),
  - ukládá snapshot do Postgresu.  
✅ Hotovo.

### 3. Databáze
**Tabulka `car_state`:**
- `car_id` (integer)
- `time` (timestamp)
- `state_of_charge` (integer)
- `latitude` (float)
- `longitude` (float)
- `gear` (integer)
- `speed` (float)

**Řešení:**
- `state_of_charge` ukládám jako `Math.round(overallSoc)`, takže je integer,
- ostatní typy odpovídají zadání.  
✅ Hotovo.

### 4. Logování a debug
- Collector loguje příjem a přeposílání zpráv,
- Writer loguje stav baterií, chybějící kapacity a ukládání snapshotů.  
✅ Pomáhá při ladění.

### 5. Optimalizace a čistota kódu
- typy (`interface CarState`, `RawMessage`),
- konfigurace oddělena (`config.ts`, `.env`),
- místo velkého `if/else` jsou použité handlery,
- snapshot se ukládá jen každých 5s → menší tlak na databázi.  
✅ Přehledné, rozšiřitelné, připravené i na více aut.

---

## Design decision: strategie snapshotů

Na začátku jsem zvažoval dva přístupy:

1. **Čekat, až dorazí všechny hodnoty a teprve pak snapshotovat.**  
   - výhoda: první záznam v DB bude kompletní  
   - nevýhoda: časová řada nezačíná od nuly, mohou chybět první sekundy  

2. **Začít snapshotovat hned a chybějící hodnoty ukládat jako `NULL`.**  
   - výhoda: časová řada je spojitá od začátku (žádné díry)  
   - nevýhoda: první řádky mohou obsahovat `NULL`, dokud auto neposlalo všechny údaje  

👉 **Rozhodnutí:** Vybral jsem variantu **2**, protože:
- zadání klade důraz na spojitost časové řady,  
- `NULL` je běžný způsob, jak vyjádřit „zatím neznámé“,  
- v praxi auto stejně většinu stavů vyšle hned po startu, takže `NULL` rychle zmizí.  
